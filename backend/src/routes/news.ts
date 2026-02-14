import { Router } from "express";
import { NewsStatus } from "@prisma/client";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeDraft = req.user!.role === "CHAIRMAN" && req.query.includeDraft === "true";

    const items = await prisma.newsPost.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(includeDraft ? {} : { status: NewsStatus.PUBLISHED }),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        attachments: true,
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
    const title = assertString(req.body.title, "title");
    const body = assertString(req.body.body, "body");

    const post = await prisma.newsPost.create({
      data: {
        tenantId: req.user!.tenantId,
        authorId: req.user!.userId,
        title,
        body,
        status: NewsStatus.DRAFT,
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_CREATED",
      entityType: "NewsPost",
      entityId: String(post.id),
      requestId: req.requestId,
    });

    res.status(201).json({ post });
  })
);

router.patch(
  "/:postId/publish",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const postId = Number(req.params.postId);
    if (!Number.isFinite(postId)) {
      throw badRequest("postId must be a number");
    }

    const post = await prisma.newsPost.findFirst({
      where: {
        id: postId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!post) {
      throw notFound("News post not found");
    }

    const updated = await prisma.newsPost.update({
      where: { id: postId },
      data: {
        status: NewsStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    const recipients = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId },
      select: { id: true },
    });

    for (const recipient of recipients) {
      await prisma.inAppNotification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: recipient.id,
          type: "NEWS",
          title: "Новая публикация",
          body: updated.title,
          payload: {
            postId: updated.id,
          },
        },
      });
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_PUBLISHED",
      entityType: "NewsPost",
      entityId: String(updated.id),
      requestId: req.requestId,
    });

    res.json({ post: updated });
  })
);

export default router;
