import { Router } from "express";
import { MeetingStatus } from "@prisma/client";
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
    const includeDraft = req.user!.role === "CHAIRMAN";

    const items = await prisma.meeting.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(includeDraft ? {} : { status: { not: MeetingStatus.DRAFT } }),
      },
      orderBy: {
        scheduledAt: "asc",
      },
      include: {
        votes: true,
      },
    });

    res.json({ items });
  })
);

router.post(
  "/",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const title = assertString(req.body.title, "title");
    const scheduledAtRaw = assertString(req.body.scheduledAt, "scheduledAt");
    const scheduledAt = new Date(scheduledAtRaw);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw badRequest("scheduledAt must be ISO date");
    }

    const meeting = await prisma.meeting.create({
      data: {
        tenantId: req.user!.tenantId,
        createdById: req.user!.userId,
        title,
        agenda: typeof req.body.agenda === "string" ? req.body.agenda : undefined,
        scheduledAt,
      },
    });

    res.status(201).json({ meeting });
  })
);

router.patch(
  "/:meetingId/publish",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: req.params.meetingId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!meeting) {
      throw notFound("Meeting not found");
    }

    const updated = await prisma.meeting.update({
      where: {
        id: meeting.id,
      },
      data: {
        status: MeetingStatus.PUBLISHED,
      },
    });

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
          type: "GOVERNANCE",
          title: "Назначено собрание",
          body: updated.title,
          payload: {
            meetingId: updated.id,
            scheduledAt: updated.scheduledAt,
          },
        },
      });
    }

    res.json({ meeting: updated });
  })
);

export default router;
