import { Router } from "express";
import { InvoiceStatus, LedgerKind, PaymentProvider, PaymentStatus } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../config/env";
import { logAudit } from "../lib/audit";
import { badRequest, notFound, unauthorized } from "../lib/errors";
import { randomToken } from "../lib/security";
import { assertNumber, assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();

router.post(
  "/initiate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const invoiceId = Math.round(assertNumber(req.body.invoiceId, "invoiceId"));
    const idempotencyKey = assertString(req.body.idempotencyKey ?? randomToken(16), "idempotencyKey");

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId: req.user!.tenantId,
      },
      include: {
        plot: true,
      },
    });

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    if (invoice.status === InvoiceStatus.CANCELED) {
      throw badRequest("Invoice is canceled");
    }

    const dueCents = invoice.totalCents - invoice.paidCents;
    if (dueCents <= 0) {
      throw badRequest("Invoice is already paid");
    }

    if (req.user!.role !== "CHAIRMAN" && invoice.plot.ownerId !== req.user!.userId) {
      throw unauthorized("Cannot pay invoice of another user");
    }

    const alreadyExists = await prisma.payment.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: req.user!.tenantId,
          idempotencyKey,
        },
      },
    });

    if (alreadyExists) {
      res.json({
        payment: alreadyExists,
        reused: true,
      });
      return;
    }

    const providerPaymentId = `tb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const payment = await prisma.payment.create({
      data: {
        tenantId: req.user!.tenantId,
        invoiceId: invoice.id,
        createdById: req.user!.userId,
        provider: PaymentProvider.T_BANK,
        status: PaymentStatus.PENDING,
        amountCents: dueCents,
        idempotencyKey,
        providerPaymentId,
        externalUrl: `https://securepay.tbank.ru/mock-pay/${providerPaymentId}`,
        rawPayload: {
          terminalKey: env.tbankTerminalKey,
          invoiceNumber: invoice.number,
        },
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "PAYMENT_INITIATED",
      entityType: "Payment",
      entityId: payment.id,
      requestId: req.requestId,
      metadata: {
        provider: payment.provider,
        amountCents: payment.amountCents,
      },
    });

    res.status(201).json({
      payment,
      checkoutUrl: payment.externalUrl,
    });
  })
);

router.post(
  "/webhook/tbank",
  asyncHandler(async (req, res) => {
    const signature = req.headers["x-tbank-signature"];
    if (env.nodeEnv === "production" && signature !== env.tbankWebhookSecret) {
      throw unauthorized("Invalid webhook signature");
    }

    const eventId = assertString(req.body.eventId, "eventId");
    const paymentId = assertString(req.body.paymentId, "paymentId");
    const tenantId = Math.round(assertNumber(req.body.tenantId, "tenantId"));
    const status = assertString(req.body.status, "status").toUpperCase();

    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId,
      },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      throw notFound("Payment not found");
    }

    const existingEvent = await prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_eventId: {
          provider: PaymentProvider.T_BANK,
          eventId,
        },
      },
    });

    if (existingEvent) {
      res.json({ ok: true, duplicate: true });
      return;
    }

    const nextStatus =
      status === "SUCCESS"
        ? PaymentStatus.SUCCESS
        : status === "FAILED"
        ? PaymentStatus.FAILED
        : PaymentStatus.PENDING;

    await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({
        data: {
          tenantId,
          provider: PaymentProvider.T_BANK,
          eventId,
          paymentId,
          payload: req.body,
          processedAt: new Date(),
        },
      });

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          settledAt: nextStatus === PaymentStatus.SUCCESS ? new Date() : undefined,
        },
      });

      if (nextStatus !== PaymentStatus.SUCCESS) {
        return;
      }

      const newPaidCents = payment.invoice.paidCents + updatedPayment.amountCents;
      const invoiceStatus =
        newPaidCents >= payment.invoice.totalCents
          ? InvoiceStatus.PAID
          : newPaidCents > 0
          ? InvoiceStatus.PARTIAL
          : InvoiceStatus.PENDING;

      await tx.invoice.update({
        where: {
          id: payment.invoice.id,
        },
        data: {
          paidCents: newPaidCents,
          status: invoiceStatus,
          closedAt: invoiceStatus === InvoiceStatus.PAID ? new Date() : null,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          tenantId,
          plotId: payment.invoice.plotId,
          userId: payment.createdById ?? undefined,
          invoiceId: payment.invoice.id,
          paymentId: payment.id,
          kind: LedgerKind.PAYMENT,
          amountCents: updatedPayment.amountCents,
          description: "Поступление по платежу",
        },
      });
    });

    res.json({ ok: true });
  })
);

router.get(
  "/:paymentId/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({
      where: {
        id: req.params.paymentId,
        tenantId: req.user!.tenantId,
      },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            status: true,
            totalCents: true,
            paidCents: true,
          },
        },
      },
    });

    if (!payment) {
      throw notFound("Payment not found");
    }

    if (req.user!.role !== "CHAIRMAN" && payment.createdById !== req.user!.userId) {
      throw unauthorized("Cannot access payment created by another user");
    }

    res.json({ payment });
  })
);

router.get(
  "/",
  requireAuth,
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const items = await prisma.payment.findMany({
      where: {
        tenantId: req.user!.tenantId,
      },
      include: {
        invoice: {
          select: {
            number: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ items });
  })
);

export default router;
