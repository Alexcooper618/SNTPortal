import { Router } from "express";
import { ForumThreadStatus } from "@prisma/client";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const items = await prisma.forumThread.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(req.user!.role === "CHAIRMAN" ? {} : { status: { not: ForumThreadStatus.HIDDEN } }),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json({ items });
  })
);

router.post(
  "/threads",
  asyncHandler(async (req, res) => {
    const title = assertString(req.body.title, "title");

    const thread = await prisma.forumThread.create({
      data: {
        tenantId: req.user!.tenantId,
        authorId: req.user!.userId,
        title,
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "FORUM_THREAD_CREATED",
      entityType: "ForumThread",
      entityId: String(thread.id),
      requestId: req.requestId,
    });

    res.status(201).json({ thread });
  })
);

router.get(
  "/threads/:threadId/messages",
  asyncHandler(async (req, res) => {
    const threadId = Number(req.params.threadId);
    if (!Number.isFinite(threadId)) {
      throw badRequest("threadId must be a number");
    }

    const thread = await prisma.forumThread.findFirst({
      where: {
        id: threadId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!thread) {
      throw notFound("Thread not found");
    }

    const messages = await prisma.forumMessage.findMany({
      where: {
        tenantId: req.user!.tenantId,
        threadId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json({
      thread,
      items: messages,
    });
  })
);

router.post(
  "/threads/:threadId/messages",
  asyncHandler(async (req, res) => {
    const threadId = Number(req.params.threadId);
    if (!Number.isFinite(threadId)) {
      throw badRequest("threadId must be a number");
    }

    const body = assertString(req.body.body, "body");

    const thread = await prisma.forumThread.findFirst({
      where: {
        id: threadId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!thread) {
      throw notFound("Thread not found");
    }

    if (thread.status === ForumThreadStatus.CLOSED && req.user!.role !== "CHAIRMAN") {
      throw badRequest("Thread is closed");
    }

    const message = await prisma.forumMessage.create({
      data: {
        tenantId: req.user!.tenantId,
        threadId,
        authorId: req.user!.userId,
        body,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await prisma.forumThread.update({
      where: { id: threadId },
      data: {
        updatedAt: new Date(),
      },
    });

    res.status(201).json({ message });
  })
);

router.patch(
  "/threads/:threadId/status",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const threadId = Number(req.params.threadId);
    if (!Number.isFinite(threadId)) {
      throw badRequest("threadId must be a number");
    }

    const next = assertString(req.body.status, "status").toUpperCase();
    if (!["OPEN", "CLOSED", "HIDDEN"].includes(next)) {
      throw badRequest("status must be OPEN/CLOSED/HIDDEN");
    }

    const updated = await prisma.forumThread.update({
      where: { id: threadId },
      data: {
        status: next as ForumThreadStatus,
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "FORUM_THREAD_STATUS_UPDATED",
      entityType: "ForumThread",
      entityId: String(threadId),
      requestId: req.requestId,
      metadata: {
        status: updated.status,
      },
    });

    res.json({ thread: updated });
  })
);

export default router;
