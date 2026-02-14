import { Router } from "express";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { assertNumber, assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const plots = await prisma.plot.findMany({
      where: {
        tenantId: req.user!.tenantId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: {
        number: "asc",
      },
    });

    res.json({ items: plots });
  })
);

router.post(
  "/",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const number = assertString(req.body.number, "number");
    const area = req.body.area === undefined ? undefined : assertNumber(req.body.area, "area");

    const existing = await prisma.plot.findUnique({
      where: {
        tenantId_number: {
          tenantId: req.user!.tenantId,
          number,
        },
      },
    });

    if (existing) {
      throw badRequest("Plot number already exists");
    }

    const plot = await prisma.plot.create({
      data: {
        tenantId: req.user!.tenantId,
        number,
        area,
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "PLOT_CREATED",
      entityType: "Plot",
      entityId: String(plot.id),
      requestId: req.requestId,
    });

    res.status(201).json({ plot });
  })
);

router.patch(
  "/:plotId/assign-owner",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const plotId = Number(req.params.plotId);
    const userId = Number(req.body.userId);

    if (!Number.isFinite(plotId) || !Number.isFinite(userId)) {
      throw badRequest("plotId and userId must be numbers");
    }

    const plot = await prisma.plot.findFirst({
      where: {
        id: plotId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!plot) {
      throw notFound("Plot not found");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!user) {
      throw notFound("User not found");
    }

    const updated = await prisma.plot.update({
      where: { id: plotId },
      data: {
        ownerId: userId,
      },
      include: {
        owner: true,
      },
    });

    const now = new Date();
    const existingMembership = await prisma.plotOwnership.findFirst({
      where: {
        tenantId: req.user!.tenantId,
        plotId,
        userId,
        toDate: null,
      },
    });

    if (existingMembership) {
      await prisma.plotOwnership.update({
        where: {
          id: existingMembership.id,
        },
        data: {
          isPrimary: true,
        },
      });
    } else {
      await prisma.plotOwnership.create({
        data: {
          tenantId: req.user!.tenantId,
          plotId,
          userId,
          isPrimary: true,
          fromDate: now,
        },
      });
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "PLOT_OWNER_ASSIGNED",
      entityType: "Plot",
      entityId: String(plotId),
      requestId: req.requestId,
      metadata: {
        ownerId: userId,
      },
    });

    res.json({ plot: updated });
  })
);

export default router;
