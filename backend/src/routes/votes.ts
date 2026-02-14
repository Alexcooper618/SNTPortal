import { Router } from "express";
import { VoteChoice, VoteStatus } from "@prisma/client";
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
    const where: Record<string, unknown> = {
      tenantId: req.user!.tenantId,
    };

    if (typeof req.query.meetingId === "string") {
      where.meetingId = req.query.meetingId;
    }

    if (req.user!.role !== "CHAIRMAN") {
      where.status = { not: VoteStatus.DRAFT };
    }

    const items = await prisma.vote.findMany({
      where,
      include: {
        ballots: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ items });
  })
);

router.post(
  "/",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const meetingId = assertString(req.body.meetingId, "meetingId");
    const title = assertString(req.body.title, "title");
    const opensAt = new Date(assertString(req.body.opensAt, "opensAt"));
    const closesAt = new Date(assertString(req.body.closesAt, "closesAt"));

    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      throw badRequest("opensAt/closesAt must be ISO dates");
    }

    const meeting = await prisma.meeting.findFirst({
      where: {
        id: meetingId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!meeting) {
      throw notFound("Meeting not found");
    }

    const vote = await prisma.vote.create({
      data: {
        tenantId: req.user!.tenantId,
        meetingId,
        createdById: req.user!.userId,
        title,
        description: typeof req.body.description === "string" ? req.body.description : undefined,
        opensAt,
        closesAt,
      },
    });

    res.status(201).json({ vote });
  })
);

router.post(
  "/:voteId/open",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const vote = await prisma.vote.findFirst({
      where: {
        id: req.params.voteId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!vote) {
      throw notFound("Vote not found");
    }

    const updated = await prisma.vote.update({
      where: { id: vote.id },
      data: {
        status: VoteStatus.OPEN,
      },
    });

    res.json({ vote: updated });
  })
);

router.post(
  "/:voteId/ballots",
  asyncHandler(async (req, res) => {
    const vote = await prisma.vote.findFirst({
      where: {
        id: req.params.voteId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!vote) {
      throw notFound("Vote not found");
    }

    if (vote.status !== VoteStatus.OPEN) {
      throw badRequest("Vote is not open");
    }

    const now = new Date();
    if (now < vote.opensAt || now > vote.closesAt) {
      throw badRequest("Voting window is closed");
    }

    const choiceRaw = assertString(req.body.choice, "choice").toUpperCase();
    if (!["YES", "NO", "ABSTAIN"].includes(choiceRaw)) {
      throw badRequest("choice must be YES/NO/ABSTAIN");
    }

    const ballot = await prisma.voteBallot.upsert({
      where: {
        voteId_userId: {
          voteId: vote.id,
          userId: req.user!.userId,
        },
      },
      update: {
        choice: choiceRaw as VoteChoice,
        createdAt: new Date(),
      },
      create: {
        tenantId: req.user!.tenantId,
        voteId: vote.id,
        userId: req.user!.userId,
        choice: choiceRaw as VoteChoice,
      },
    });

    res.status(201).json({ ballot });
  })
);

router.post(
  "/:voteId/close",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const vote = await prisma.vote.findFirst({
      where: {
        id: req.params.voteId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!vote) {
      throw notFound("Vote not found");
    }

    const updated = await prisma.vote.update({
      where: {
        id: vote.id,
      },
      data: {
        status: VoteStatus.CLOSED,
      },
    });

    res.json({ vote: updated });
  })
);

export default router;
