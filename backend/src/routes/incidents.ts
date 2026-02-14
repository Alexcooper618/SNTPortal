import { Router } from "express";
import { IncidentPriority, IncidentStatus, NotificationType } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, notFound } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await prisma.incident.findMany({
      where: {
        tenantId: req.user!.tenantId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    res.json({ items });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const title = assertString(req.body.title, "title");
    const description = assertString(req.body.description, "description");

    const priorityRaw = typeof req.body.priority === "string" ? req.body.priority.toUpperCase() : "MEDIUM";
    const priority =
      priorityRaw === "LOW"
        ? IncidentPriority.LOW
        : priorityRaw === "HIGH"
        ? IncidentPriority.HIGH
        : priorityRaw === "CRITICAL"
        ? IncidentPriority.CRITICAL
        : IncidentPriority.MEDIUM;

    const incident = await prisma.incident.create({
      data: {
        tenantId: req.user!.tenantId,
        createdById: req.user!.userId,
        title,
        description,
        priority,
        plotId: req.body.plotId === undefined ? undefined : Number(req.body.plotId),
        mapObjectId: req.body.mapObjectId === undefined ? undefined : Number(req.body.mapObjectId),
      },
    });

    if (req.user!.role === "USER") {
      const chairmen = await prisma.user.findMany({
        where: {
          tenantId: req.user!.tenantId,
          role: "CHAIRMAN",
          isActive: true,
        },
        select: { id: true },
      });

      for (const chairman of chairmen) {
        await prisma.inAppNotification.create({
          data: {
            tenantId: req.user!.tenantId,
            userId: chairman.id,
            type: NotificationType.INCIDENT,
            title: "Новое обращение",
            body: incident.title,
            payload: {
              incidentId: incident.id,
            },
          },
        });
      }
    }

    res.status(201).json({ incident });
  })
);

router.patch(
  "/:incidentId/status",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const incidentId = req.params.incidentId;
    const statusRaw = assertString(req.body.status, "status").toUpperCase();

    if (!["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"].includes(statusRaw)) {
      throw badRequest("Invalid incident status");
    }

    const incident = await prisma.incident.findFirst({
      where: {
        id: incidentId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!incident) {
      throw notFound("Incident not found");
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: statusRaw as IncidentStatus,
        assignedToId:
          req.body.assignedToId === undefined ? incident.assignedToId : Number(req.body.assignedToId),
        resolvedAt: statusRaw === "RESOLVED" ? new Date() : null,
      },
    });

    await prisma.inAppNotification.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: incident.createdById,
        type: NotificationType.INCIDENT,
        title: "Обновлен статус обращения",
        body: `${updated.title}: ${updated.status}`,
        payload: {
          incidentId: updated.id,
          status: updated.status,
        },
      },
    });

    res.json({ incident: updated });
  })
);

export default router;
