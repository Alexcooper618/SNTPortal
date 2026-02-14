import { Router } from "express";
import { ChargeStatus, ChargeType, InvoiceStatus, LedgerKind, NotificationType, UserRole } from "@prisma/client";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, customError, notFound } from "../lib/errors";
import { assertArray, assertNumber, assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

type Audience = "ALL_ACTIVE_USERS_PRIMARY_PLOTS" | "USERS_PRIMARY_PLOTS" | "PLOTS";

const parseIsoDate = (raw: string, fieldName: string): Date => {
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) {
    throw badRequest(`${fieldName} must be ISO datetime`);
  }
  return dt;
};

const buildBillingNotificationBody = (params: {
  title: string;
  unitAmountCents: number;
  dueDate: Date;
}) => {
  const amount = `${(params.unitAmountCents / 100).toLocaleString("ru-RU")} ₽`;
  const due = params.dueDate.toLocaleDateString("ru-RU");
  return `${params.title} · к оплате ${amount} до ${due}`;
};

const getPrimaryPlotByUser = async (tenantId: number, userIds: number[]) => {
  if (userIds.length === 0) return new Map<number, number>();

  const ownerships = await prisma.plotOwnership.findMany({
    where: {
      tenantId,
      userId: { in: userIds },
      toDate: null,
      isPrimary: true,
    },
    orderBy: {
      fromDate: "desc",
    },
    select: {
      userId: true,
      plotId: true,
    },
  });

  const map = new Map<number, number>();
  for (const item of ownerships) {
    if (!map.has(item.userId)) {
      map.set(item.userId, item.plotId);
    }
  }
  return map;
};

const publishChargeTx = async (
  tx: any,
  params: { tenantId: number; chargeId: number; actorId: number; requestId?: string }
) => {
  const charge = await tx.charge.findFirst({
    where: {
      id: params.chargeId,
      tenantId: params.tenantId,
    },
    include: {
      lines: {
        include: {
          plot: {
            select: {
              id: true,
              number: true,
              ownerId: true,
              owner: {
                select: {
                  id: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!charge) {
    throw customError(404, "CHARGE_NOT_FOUND", "Charge not found");
  }

  if (charge.status === ChargeStatus.PUBLISHED || charge.status === ChargeStatus.CLOSED) {
    throw badRequest("Charge already published or closed");
  }

  await tx.charge.update({
    where: { id: charge.id },
    data: {
      status: ChargeStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  for (const line of charge.lines) {
    const invoiceNumber = `INV-${charge.id}-${line.plotId}`;

    const existing = await tx.invoice.findUnique({
      where: {
        tenantId_number: {
          tenantId: params.tenantId,
          number: invoiceNumber,
        },
      },
    });

    if (existing) {
      continue;
    }

    const invoice = await tx.invoice.create({
      data: {
        tenantId: params.tenantId,
        chargeId: charge.id,
        plotId: line.plotId,
        userId: line.plot.ownerId ?? undefined,
        number: invoiceNumber,
        totalCents: line.amountCents,
        dueDate: charge.dueDate,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        tenantId: params.tenantId,
        plotId: line.plotId,
        userId: line.plot.ownerId ?? undefined,
        invoiceId: invoice.id,
        kind: LedgerKind.ACCRUAL,
        amountCents: line.amountCents,
        description: `Начисление: ${charge.title}`,
      },
    });

    if (line.plot.ownerId && line.plot.owner?.isActive) {
      await tx.inAppNotification.create({
        data: {
          tenantId: params.tenantId,
          userId: line.plot.ownerId,
          type: NotificationType.BILLING,
          title: "Новый счет к оплате",
          body: buildBillingNotificationBody({
            title: charge.title,
            unitAmountCents: line.amountCents,
            dueDate: charge.dueDate,
          }),
          payload: {
            chargeId: charge.id,
            invoiceId: invoice.id,
          },
        },
      });
    }
  }

  await logAudit({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "CHARGE_PUBLISHED",
    entityType: "Charge",
    entityId: String(charge.id),
    requestId: params.requestId,
  });
};

router.get(
  "/charges",
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;

    const charges = await prisma.charge.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (charges.length === 0) {
      res.json({ items: [] });
      return;
    }

    const chargeIds = charges.map((c) => c.id);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        chargeId: { in: chargeIds },
      },
      select: {
        chargeId: true,
        status: true,
        totalCents: true,
        paidCents: true,
        plot: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    const minePlotIds =
      req.user!.role === "CHAIRMAN"
        ? null
        : (
            await prisma.plot.findMany({
              where: {
                tenantId,
                ownerId: req.user!.userId,
              },
              select: { id: true },
            })
          ).map((p) => p.id);

    const byCharge = new Map<
      number,
      {
        totalCents: number;
        paidCents: number;
        participantsCount: number;
        paidCount: number;
        unpaidCount: number;
        myInvoice?: { id: number; status: string; totalCents: number; paidCents: number };
        canceledCount: number;
      }
    >();

    for (const c of charges) {
      byCharge.set(c.id, {
        totalCents: 0,
        paidCents: 0,
        participantsCount: 0,
        paidCount: 0,
        unpaidCount: 0,
        canceledCount: 0,
      });
    }

    for (const inv of invoices) {
      if (!inv.chargeId) continue;
      const agg = byCharge.get(inv.chargeId);
      if (!agg) continue;

      if (inv.status === InvoiceStatus.CANCELED) {
        agg.canceledCount += 1;
        continue;
      }

      agg.participantsCount += 1;
      agg.totalCents += inv.totalCents;
      agg.paidCents += inv.paidCents;
      if (inv.status === InvoiceStatus.PAID) {
        agg.paidCount += 1;
      } else {
        agg.unpaidCount += 1;
      }
    }

    const items =
      req.user!.role === "CHAIRMAN"
        ? charges.map((charge) => {
            const agg = byCharge.get(charge.id)!;
            const progressPercent =
              agg.totalCents > 0 ? Math.round((agg.paidCents / agg.totalCents) * 100) : 0;
            return {
              id: charge.id,
              title: charge.title,
              status: charge.status,
              type: charge.type,
              dueDate: charge.dueDate,
              publishedAt: charge.publishedAt,
              unitAmountCents: charge.amountCents,
              totalCents: agg.totalCents,
              paidCents: agg.paidCents,
              progressPercent,
              participantsCount: agg.participantsCount,
              paidCount: agg.paidCount,
              unpaidCount: agg.unpaidCount,
              canceledCount: agg.canceledCount,
              createdAt: charge.createdAt,
            };
          })
        : charges
            .map((charge) => {
              const mineInvoices = invoices.filter((inv) => inv.chargeId === charge.id);
              const hasMine = minePlotIds
                ? mineInvoices.some((inv) => inv.plot.ownerId === req.user!.userId)
                : false;
              if (!hasMine) return null;

              const agg = byCharge.get(charge.id)!;
              const progressPercent =
                agg.totalCents > 0 ? Math.round((agg.paidCents / agg.totalCents) * 100) : 0;
              return {
                id: charge.id,
                title: charge.title,
                status: charge.status,
                type: charge.type,
                dueDate: charge.dueDate,
                publishedAt: charge.publishedAt,
                unitAmountCents: charge.amountCents,
                totalCents: agg.totalCents,
                paidCents: agg.paidCents,
                progressPercent,
                participantsCount: agg.participantsCount,
                paidCount: agg.paidCount,
                unpaidCount: agg.unpaidCount,
                canceledCount: agg.canceledCount,
                createdAt: charge.createdAt,
              };
            })
            .filter(Boolean);

    res.json({ items });
  })
);

router.post(
  "/charges",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;

    const title = assertString(req.body.title, "title");
    const dueDate = parseIsoDate(assertString(req.body.dueDate, "dueDate"), "dueDate");

    const description =
      typeof req.body.description === "string" ? req.body.description.trim() : undefined;

    const typeRaw = (typeof req.body.type === "string" ? req.body.type : "ONE_TIME").toUpperCase();
    const type =
      typeRaw === "TARGETED"
        ? ChargeType.TARGETED
        : typeRaw === "MONTHLY"
        ? ChargeType.MONTHLY
        : ChargeType.ONE_TIME;

    const publishNow = req.body.publishNow === undefined ? true : Boolean(req.body.publishNow);

    const audienceRaw = typeof req.body.audience === "string" ? req.body.audience.toUpperCase() : null;
    const includeChairman = Boolean(req.body.includeChairman);

    const unitAmountCents = Math.round(
      assertNumber(req.body.unitAmountCents ?? req.body.amountCents, "unitAmountCents")
    );

    // Legacy behavior: if audience isn't provided, treat amountCents as total and split by plots.
    if (!audienceRaw) {
      const amountCents = unitAmountCents;

      const plotIdsRaw = req.body.plotIds;
      const plotIds =
        plotIdsRaw === undefined
          ? (
              await prisma.plot.findMany({
                where: { tenantId },
                select: { id: true },
              })
            ).map((item) => item.id)
          : assertArray<number>(plotIdsRaw, "plotIds").map((id) => Number(id));

      if (plotIds.length === 0) {
        throw badRequest("No plots found for charge");
      }

      const charge = await prisma.charge.create({
        data: {
          tenantId,
          title,
          description,
          type,
          amountCents,
          dueDate,
          createdById: req.user!.userId,
        },
      });

      const splitAmount = Math.round(amountCents / plotIds.length);

      for (const plotId of plotIds) {
        await prisma.chargeLine.create({
          data: {
            chargeId: charge.id,
            plotId,
            amountCents: splitAmount,
          },
        });
      }

      await logAudit({
        tenantId,
        actorId: req.user!.userId,
        action: "CHARGE_CREATED",
        entityType: "Charge",
        entityId: String(charge.id),
        requestId: req.requestId,
        metadata: {
          plotsCount: plotIds.length,
        },
      });

      res.status(201).json({
        charge,
        participants: {
          includedUsers: 0,
          includedPlots: plotIds.length,
          skippedUsers: [],
        },
        published: false,
      });
      return;
    }

    const audience = audienceRaw as Audience;

    const skippedUsers: Array<{ userId: number; reason: "NO_PRIMARY_PLOT" | "INACTIVE" }> = [];

    let plotIds: number[] = [];
    let includedUsers = 0;

    if (audience === "PLOTS") {
      const plotIdsRaw = req.body.plotIds;
      plotIds =
        plotIdsRaw === undefined
          ? (
              await prisma.plot.findMany({
                where: { tenantId },
                select: { id: true },
              })
            ).map((item) => item.id)
          : assertArray<number>(plotIdsRaw, "plotIds").map((id) => Number(id));
    } else {
      const userIdsRaw =
        audience === "USERS_PRIMARY_PLOTS"
          ? assertArray<number>(req.body.userIds, "userIds").map((id) => Number(id))
          : (
              await prisma.user.findMany({
                where: {
                  tenantId,
                  isActive: true,
                  role: includeChairman ? { in: [UserRole.USER, UserRole.CHAIRMAN] } : UserRole.USER,
                },
                select: { id: true },
              })
            ).map((u) => u.id);

      const users = await prisma.user.findMany({
        where: {
          tenantId,
          id: { in: userIdsRaw },
        },
        select: {
          id: true,
          isActive: true,
          role: true,
        },
      });

      const allowed = new Set<number>();
      const found = new Set<number>(users.map((u) => u.id));

      for (const u of users) {
        const roleAllowed = includeChairman ? true : u.role === UserRole.USER;
        if (!u.isActive || !roleAllowed) {
          skippedUsers.push({ userId: u.id, reason: "INACTIVE" });
        } else {
          allowed.add(u.id);
        }
      }

      for (const requestedId of userIdsRaw) {
        if (!found.has(requestedId)) {
          skippedUsers.push({ userId: requestedId, reason: "INACTIVE" });
        }
      }

      const primaryPlotMap = await getPrimaryPlotByUser(tenantId, Array.from(allowed));

      for (const userId of allowed) {
        const plotId = primaryPlotMap.get(userId);
        if (!plotId) {
          skippedUsers.push({ userId, reason: "NO_PRIMARY_PLOT" });
          continue;
        }
        plotIds.push(plotId);
        includedUsers += 1;
      }
    }

    plotIds = Array.from(new Set(plotIds));

    if (plotIds.length === 0) {
      throw badRequest("No plots found for charge");
    }

    const created = await prisma.$transaction(async (tx) => {
      const charge = await tx.charge.create({
        data: {
          tenantId,
          title,
          description,
          type,
          status: publishNow ? ChargeStatus.PUBLISHED : ChargeStatus.DRAFT,
          amountCents: unitAmountCents,
          dueDate,
          createdById: req.user!.userId,
          publishedAt: publishNow ? new Date() : null,
        },
      });

      await tx.chargeLine.createMany({
        data: plotIds.map((plotId) => ({
          chargeId: charge.id,
          plotId,
          amountCents: unitAmountCents,
        })),
        skipDuplicates: true,
      });

      if (publishNow) {
        // Publish-like behavior (create invoices + accrual ledger + notifications) in the same tx.
        const hydrated = await tx.charge.findFirstOrThrow({
          where: { id: charge.id, tenantId },
          include: {
            lines: {
              include: {
                plot: {
                  select: {
                    id: true,
                    ownerId: true,
                    owner: {
                      select: { id: true, isActive: true },
                    },
                  },
                },
              },
            },
          },
        });

        for (const line of hydrated.lines) {
          const invoiceNumber = `INV-${charge.id}-${line.plotId}`;
          const existingInvoice = await tx.invoice.findUnique({
            where: {
              tenantId_number: {
                tenantId,
                number: invoiceNumber,
              },
            },
          });
          if (existingInvoice) continue;

          const invoice = await tx.invoice.create({
            data: {
              tenantId,
              chargeId: charge.id,
              plotId: line.plotId,
              userId: line.plot.ownerId ?? undefined,
              number: invoiceNumber,
              totalCents: line.amountCents,
              dueDate,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              tenantId,
              plotId: line.plotId,
              userId: line.plot.ownerId ?? undefined,
              invoiceId: invoice.id,
              kind: LedgerKind.ACCRUAL,
              amountCents: line.amountCents,
              description: `Начисление: ${title}`,
            },
          });

          if (line.plot.ownerId && line.plot.owner?.isActive) {
            await tx.inAppNotification.create({
              data: {
                tenantId,
                userId: line.plot.ownerId,
                type: NotificationType.BILLING,
                title: "Новый счет к оплате",
                body: buildBillingNotificationBody({
                  title,
                  unitAmountCents: line.amountCents,
                  dueDate,
                }),
                payload: {
                  chargeId: charge.id,
                  invoiceId: invoice.id,
                },
              },
            });
          }
        }

        await logAudit({
          tenantId,
          actorId: req.user!.userId,
          action: "CHARGE_PUBLISHED",
          entityType: "Charge",
          entityId: String(charge.id),
          requestId: req.requestId,
        });
      }

      return charge;
    });

    await logAudit({
      tenantId,
      actorId: req.user!.userId,
      action: "CHARGE_CREATED",
      entityType: "Charge",
      entityId: String(created.id),
      requestId: req.requestId,
      metadata: {
        audience,
        includedPlots: plotIds.length,
        includedUsers,
        skippedUsersCount: skippedUsers.length,
      },
    });

    res.status(201).json({
      charge: created,
      participants: {
        includedUsers,
        includedPlots: plotIds.length,
        skippedUsers,
      },
      published: publishNow,
    });
  })
);

router.post(
  "/charges/:chargeId/publish",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const chargeId = Number(req.params.chargeId);
    if (!Number.isFinite(chargeId)) {
      throw badRequest("chargeId must be a number");
    }

    await prisma.$transaction(async (tx) => {
      await publishChargeTx(tx, {
        tenantId: req.user!.tenantId,
        chargeId,
        actorId: req.user!.userId,
        requestId: req.requestId,
      });
    });

    res.json({ ok: true });
  })
);

router.get(
  "/charges/:chargeId",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const chargeId = Number(req.params.chargeId);
    if (!Number.isFinite(chargeId)) {
      throw badRequest("chargeId must be a number");
    }

    const charge = await prisma.charge.findFirst({
      where: {
        id: chargeId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!charge) {
      throw customError(404, "CHARGE_NOT_FOUND", "Charge not found");
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: req.user!.tenantId,
        chargeId: charge.id,
      },
      include: {
        plot: {
          select: {
            id: true,
            number: true,
            owner: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: {
        issuedAt: "desc",
      },
    });

    let totalCents = 0;
    let paidCents = 0;
    let participantsCount = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let canceledCount = 0;

    for (const invoice of invoices) {
      if (invoice.status === InvoiceStatus.CANCELED) {
        canceledCount += 1;
        continue;
      }
      participantsCount += 1;
      totalCents += invoice.totalCents;
      paidCents += invoice.paidCents;
      if (invoice.status === InvoiceStatus.PAID) paidCount += 1;
      else if (invoice.status === InvoiceStatus.PARTIAL) partialCount += 1;
      else unpaidCount += 1;
    }

    const outstandingCents = totalCents - paidCents;
    const progressPercent = totalCents > 0 ? Math.round((paidCents / totalCents) * 100) : 0;

    res.json({
      charge,
      summary: {
        totalCents,
        paidCents,
        outstandingCents,
        progressPercent,
        participantsCount,
        paidCount,
        partialCount,
        unpaidCount,
        canceledCount,
      },
      participants: invoices.map((invoice) => ({
        invoice: {
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          totalCents: invoice.totalCents,
          paidCents: invoice.paidCents,
          dueDate: invoice.dueDate,
          issuedAt: invoice.issuedAt,
          closedAt: invoice.closedAt,
        },
        user: invoice.user ?? invoice.plot.owner ?? null,
        plot: {
          id: invoice.plot.id,
          number: invoice.plot.number,
        },
      })),
    });
  })
);

router.put(
  "/charges/:chargeId/participants",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;
    const chargeId = Number(req.params.chargeId);
    if (!Number.isFinite(chargeId)) {
      throw badRequest("chargeId must be a number");
    }

    const userIds = Array.from(
      new Set(assertArray<number>(req.body.userIds, "userIds").map((id) => Number(id)))
    );

    const charge = await prisma.charge.findFirst({
      where: {
        id: chargeId,
        tenantId,
      },
    });

    if (!charge) {
      throw customError(404, "CHARGE_NOT_FOUND", "Charge not found");
    }

    if (charge.status === ChargeStatus.CLOSED) {
      throw customError(400, "CHARGE_NOT_EDITABLE", "Charge is closed");
    }

    const skippedUsers: Array<{ userId: number; reason: "NO_PRIMARY_PLOT" | "INACTIVE" }> = [];

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        id: { in: userIds },
      },
      select: {
        id: true,
        isActive: true,
        role: true,
      },
    });

    const allowed = new Set<number>();
    const found = new Set<number>(users.map((u) => u.id));

    for (const u of users) {
      if (!u.isActive || u.role !== UserRole.USER) {
        skippedUsers.push({ userId: u.id, reason: "INACTIVE" });
      } else {
        allowed.add(u.id);
      }
    }

    for (const requestedId of userIds) {
      if (!found.has(requestedId)) {
        skippedUsers.push({ userId: requestedId, reason: "INACTIVE" });
      }
    }

    const primaryPlotMap = await getPrimaryPlotByUser(tenantId, Array.from(allowed));

    const desiredPlotIds: number[] = [];
    let includedUsers = 0;

    for (const userId of allowed) {
      const plotId = primaryPlotMap.get(userId);
      if (!plotId) {
        skippedUsers.push({ userId, reason: "NO_PRIMARY_PLOT" });
        continue;
      }
      desiredPlotIds.push(plotId);
      includedUsers += 1;
    }

    const desiredPlots = new Set<number>(desiredPlotIds);

    const currentLines = await prisma.chargeLine.findMany({
      where: {
        chargeId: charge.id,
      },
      select: {
        plotId: true,
      },
    });

    const currentPlots = new Set<number>(currentLines.map((l) => l.plotId));
    const toAdd = Array.from(desiredPlots).filter((plotId) => !currentPlots.has(plotId));
    const toRemove = Array.from(currentPlots).filter((plotId) => !desiredPlots.has(plotId));

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const plotId of toRemove) {
        const invoiceNumber = `INV-${charge.id}-${plotId}`;
        const invoice = await tx.invoice.findUnique({
          where: {
            tenantId_number: {
              tenantId,
              number: invoiceNumber,
            },
          },
        });

        if (invoice && invoice.paidCents > 0) {
          throw customError(409, "CANNOT_REMOVE_PAID_PARTICIPANT", "Participant has payments");
        }

        if (invoice && invoice.status !== InvoiceStatus.CANCELED) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: InvoiceStatus.CANCELED,
              closedAt: now,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              tenantId,
              plotId,
              userId: invoice.userId ?? undefined,
              invoiceId: invoice.id,
              kind: LedgerKind.ADJUSTMENT,
              amountCents: -invoice.totalCents,
              description: `Отмена начисления: ${charge.title}`,
            },
          });
        }

        await tx.chargeLine.deleteMany({
          where: {
            chargeId: charge.id,
            plotId,
          },
        });
      }

      for (const plotId of toAdd) {
        await tx.chargeLine.create({
          data: {
            chargeId: charge.id,
            plotId,
            amountCents: charge.amountCents,
          },
        });

        if (charge.status === ChargeStatus.PUBLISHED) {
          const plot = await tx.plot.findFirst({
            where: {
              tenantId,
              id: plotId,
            },
            select: {
              ownerId: true,
              owner: {
                select: { isActive: true },
              },
            },
          });

          const invoiceNumber = `INV-${charge.id}-${plotId}`;
          const existingInvoice = await tx.invoice.findUnique({
            where: {
              tenantId_number: {
                tenantId,
                number: invoiceNumber,
              },
            },
          });

          if (!existingInvoice) {
            const invoice = await tx.invoice.create({
              data: {
                tenantId,
                chargeId: charge.id,
                plotId,
                userId: plot?.ownerId ?? undefined,
                number: invoiceNumber,
                totalCents: charge.amountCents,
                dueDate: charge.dueDate,
              },
            });

            await tx.ledgerEntry.create({
              data: {
                tenantId,
                plotId,
                userId: plot?.ownerId ?? undefined,
                invoiceId: invoice.id,
                kind: LedgerKind.ACCRUAL,
                amountCents: charge.amountCents,
                description: `Начисление: ${charge.title}`,
              },
            });

            if (plot?.ownerId && plot.owner?.isActive) {
              await tx.inAppNotification.create({
                data: {
                  tenantId,
                  userId: plot.ownerId,
                  type: NotificationType.BILLING,
                  title: "Новый счет к оплате",
                  body: buildBillingNotificationBody({
                    title: charge.title,
                    unitAmountCents: charge.amountCents,
                    dueDate: charge.dueDate,
                  }),
                  payload: {
                    chargeId: charge.id,
                    invoiceId: invoice.id,
                  },
                },
              });
            }
          } else if (existingInvoice.status === InvoiceStatus.CANCELED && existingInvoice.paidCents === 0) {
            const updated = await tx.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                status: InvoiceStatus.PENDING,
                closedAt: null,
                totalCents: charge.amountCents,
                dueDate: charge.dueDate,
                userId: plot?.ownerId ?? undefined,
              },
            });

            await tx.ledgerEntry.create({
              data: {
                tenantId,
                plotId,
                userId: plot?.ownerId ?? undefined,
                invoiceId: updated.id,
                kind: LedgerKind.ACCRUAL,
                amountCents: charge.amountCents,
                description: `Начисление: ${charge.title}`,
              },
            });

            if (plot?.ownerId && plot.owner?.isActive) {
              await tx.inAppNotification.create({
                data: {
                  tenantId,
                  userId: plot.ownerId,
                  type: NotificationType.BILLING,
                  title: "Новый счет к оплате",
                  body: buildBillingNotificationBody({
                    title: charge.title,
                    unitAmountCents: charge.amountCents,
                    dueDate: charge.dueDate,
                  }),
                  payload: {
                    chargeId: charge.id,
                    invoiceId: updated.id,
                  },
                },
              });
            }
          }
        }
      }
    });

    await logAudit({
      tenantId,
      actorId: req.user!.userId,
      action: "CHARGE_PARTICIPANTS_UPDATED",
      entityType: "Charge",
      entityId: String(charge.id),
      requestId: req.requestId,
      metadata: {
        includedUsers,
        added: toAdd.length,
        removed: toRemove.length,
        skippedUsersCount: skippedUsers.length,
      },
    });

    res.json({
      ok: true,
      added: toAdd.length,
      removed: toRemove.length,
      skippedUsers,
    });
  })
);

router.post(
  "/charges/:chargeId/close",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;
    const chargeId = Number(req.params.chargeId);
    if (!Number.isFinite(chargeId)) {
      throw badRequest("chargeId must be a number");
    }

    const existing = await prisma.charge.findFirst({
      where: {
        id: chargeId,
        tenantId,
      },
    });

    if (!existing) {
      throw customError(404, "CHARGE_NOT_FOUND", "Charge not found");
    }

    if (existing.status === ChargeStatus.CLOSED) {
      res.json({ ok: true, alreadyClosed: true });
      return;
    }

    await prisma.charge.update({
      where: { id: existing.id },
      data: {
        status: ChargeStatus.CLOSED,
      },
    });

    await logAudit({
      tenantId,
      actorId: req.user!.userId,
      action: "CHARGE_CLOSED",
      entityType: "Charge",
      entityId: String(existing.id),
      requestId: req.requestId,
    });

    res.json({ ok: true });
  })
);

router.get(
  "/balance/me",
  asyncHandler(async (req, res) => {
    const plots = await prisma.plot.findMany({
      where: {
        tenantId: req.user!.tenantId,
        OR: [{ ownerId: req.user!.userId }],
      },
      select: {
        id: true,
      },
    });

    const plotIds = plots.map((plot) => plot.id);

    if (plotIds.length === 0) {
      res.json({
        totalDueCents: 0,
        totalPaidCents: 0,
        outstandingCents: 0,
        invoices: [],
      });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: req.user!.tenantId,
        plotId: {
          in: plotIds,
        },
        status: {
          not: InvoiceStatus.CANCELED,
        },
      },
      orderBy: {
        issuedAt: "desc",
      },
    });

    const totalDueCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const totalPaidCents = invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0);

    res.json({
      totalDueCents,
      totalPaidCents,
      outstandingCents: totalDueCents - totalPaidCents,
      invoices,
    });
  })
);

router.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;

    if (req.user!.role === "CHAIRMAN") {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId,
        },
        include: {
          plot: {
            select: {
              id: true,
              number: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          charge: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
        orderBy: {
          issuedAt: "desc",
        },
      });

      res.json({
        items: invoices.map((invoice) => ({
          ...invoice,
          user: invoice.user ?? null,
        })),
      });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        plot: {
          ownerId: req.user!.userId,
        },
      },
      include: {
        plot: {
          select: {
            id: true,
            number: true,
          },
        },
        charge: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: {
        issuedAt: "desc",
      },
    });

    res.json({ items: invoices });
  })
);

router.post(
  "/invoices/:invoiceId/cancel",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const invoiceId = Number(req.params.invoiceId);
    if (!Number.isFinite(invoiceId)) {
      throw badRequest("invoiceId must be a number");
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw badRequest("Paid invoice cannot be canceled");
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELED,
        closedAt: new Date(),
      },
    });

    // Optional adjustment entry for bookkeeping.
    await prisma.ledgerEntry.create({
      data: {
        tenantId: req.user!.tenantId,
        plotId: invoice.plotId,
        userId: invoice.userId ?? undefined,
        invoiceId: invoice.id,
        kind: LedgerKind.ADJUSTMENT,
        amountCents: -invoice.totalCents,
        description: "Отмена счета",
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "INVOICE_CANCELED",
      entityType: "Invoice",
      entityId: String(invoiceId),
      requestId: req.requestId,
    });

    res.json({ invoice: updated });
  })
);

export default router;
