import { Router } from "express";
import { NotificationType } from "@prisma/client";
import { prisma } from "../db";
import { badRequest } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await prisma.inAppNotification.findMany({
      where: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    const unreadCount = items.filter((item) => !item.isRead).length;

    res.json({
      items,
      unreadCount,
    });
  })
);

router.post(
  "/:notificationId/read",
  asyncHandler(async (req, res) => {
    await prisma.inAppNotification.updateMany({
      where: {
        id: req.params.notificationId,
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ ok: true });
  })
);

router.post(
  "/mark-all-read",
  asyncHandler(async (req, res) => {
    await prisma.inAppNotification.updateMany({
      where: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ ok: true });
  })
);

router.post(
  "/broadcast",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const title = assertString(req.body.title, "title");
    const body = assertString(req.body.body, "body");

    const typeRaw = typeof req.body.type === "string" ? req.body.type.toUpperCase() : "SYSTEM";
    if (!["SYSTEM", "BILLING", "NEWS", "FORUM", "INCIDENT", "GOVERNANCE"].includes(typeRaw)) {
      throw badRequest("Invalid notification type");
    }

    const recipients = await prisma.user.findMany({
      where: {
        tenantId: req.user!.tenantId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    for (const recipient of recipients) {
      await prisma.inAppNotification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: recipient.id,
          type: typeRaw as NotificationType,
          title,
          body,
          payload: req.body.payload ?? undefined,
        },
      });
    }

    res.status(201).json({
      ok: true,
      recipients: recipients.length,
    });
  })
);

export default router;
