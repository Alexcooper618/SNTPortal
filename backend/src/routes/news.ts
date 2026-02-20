import { Router } from "express";
import { NewsStatus, NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, forbidden, notFound } from "../lib/errors";
import {
  NEWS_POST_MEDIA_MAX_FILES,
  STORY_TTL_HOURS,
  persistNewsMedia,
  removeUploadedFileByUrl,
} from "../lib/media-storage";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";
import {
  getUploadedFiles,
  parseNewsPostMedia,
  parseNewsStoryMedia,
} from "../middlewares/upload";

const router = Router();
router.use(requireAuth);
router.use(requireRole("USER", "CHAIRMAN"));

const FEED_DEFAULT_LIMIT = 20;
const FEED_MAX_LIMIT = 50;
const COMMENT_DEFAULT_LIMIT = 20;
const COMMENT_MAX_LIMIT = 100;

const parseLimit = (raw: unknown, fallback: number, max: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(max, Math.floor(parsed));
};

const parsePostId = (raw: string, fieldName = "postId") => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${fieldName} must be a positive integer`);
  }
  return parsed;
};

const readOptionalTrimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const derivePostTitle = (titleRaw: string, body: string) => {
  if (titleRaw.length > 0) return titleRaw.slice(0, 140);

  const normalizedBody = body
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedBody) return "Новый пост";
  return normalizedBody.slice(0, 140);
};

const cleanupPersistedMedia = async (entries: Array<{ fileUrl: string }>) => {
  await Promise.all(entries.map((entry) => removeUploadedFileByUrl(entry.fileUrl)));
};

const buildPostResponse = <
  T extends {
    likes: Array<{ id: string }>;
    _count: { likes: number; comments: number };
  },
>(
  post: T
) => ({
  ...post,
  likedByMe: post.likes.length > 0,
  likesCount: post._count.likes,
  commentsCount: post._count.comments,
});

const notifyUsersAboutPost = async (params: {
  tenantId: number;
  authorId: number;
  postId: number;
  title: string;
}) => {
  const recipients = await prisma.user.findMany({
    where: {
      tenantId: params.tenantId,
      isActive: true,
      role: { in: ["USER", "CHAIRMAN"] },
      id: {
        not: params.authorId,
      },
    },
    select: { id: true },
  });

  if (recipients.length === 0) return;

  await prisma.inAppNotification.createMany({
    data: recipients.map((recipient) => ({
      tenantId: params.tenantId,
      userId: recipient.id,
      type: NotificationType.NEWS,
      title: "Новая публикация",
      body: params.title,
      payload: {
        postId: params.postId,
      } as Prisma.InputJsonValue,
    })),
  });
};

const assertPostExists = async (tenantId: number, postId: number) => {
  const post = await prisma.newsPost.findFirst({
    where: {
      id: postId,
      tenantId,
      status: NewsStatus.PUBLISHED,
    },
  });

  if (!post) {
    throw notFound("News post not found");
  }

  return post;
};

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
        attachments: {
          orderBy: {
            sortOrder: "asc",
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

router.get(
  "/feed",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT);
    const cursor = typeof req.query.cursor === "string" ? Number(req.query.cursor) : NaN;
    const hasCursor = Number.isInteger(cursor) && cursor > 0;

    const items = await prisma.newsPost.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: NewsStatus.PUBLISHED,
        ...(hasCursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        attachments: {
          orderBy: {
            sortOrder: "asc",
          },
        },
        likes: {
          where: {
            userId: req.user!.userId,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      take: limit,
    });

    const nextCursor = items.length === limit ? items[items.length - 1]?.id ?? null : null;

    res.json({
      items: items.map((post) => buildPostResponse(post)),
      nextCursor,
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = assertString(req.body.body, "body");
    const title = derivePostTitle(readOptionalTrimmed(req.body.title), body);
    const now = new Date();

    const post = await prisma.newsPost.create({
      data: {
        tenantId: req.user!.tenantId,
        authorId: req.user!.userId,
        title,
        body,
        status: NewsStatus.PUBLISHED,
        publishedAt: now,
      },
    });

    await notifyUsersAboutPost({
      tenantId: req.user!.tenantId,
      authorId: req.user!.userId,
      postId: post.id,
      title: post.title,
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_POST_CREATED",
      entityType: "NewsPost",
      entityId: String(post.id),
      requestId: req.requestId,
    });

    res.status(201).json({ post });
  })
);

router.post(
  "/posts",
  parseNewsPostMedia,
  asyncHandler(async (req, res) => {
    const uploadedFiles = getUploadedFiles(req);
    const persistedMedia: Array<Awaited<ReturnType<typeof persistNewsMedia>>> = [];

    try {
      const body = readOptionalTrimmed(req.body.body);
      if (!body && uploadedFiles.length === 0) {
        throw badRequest("Post body or media is required");
      }

      const title = derivePostTitle(readOptionalTrimmed(req.body.title), body);
      if (uploadedFiles.length > NEWS_POST_MEDIA_MAX_FILES) {
        throw badRequest("Too many media files");
      }

      for (const file of uploadedFiles) {
        const persisted = await persistNewsMedia({
          kind: "post",
          originalName: file.originalName,
          mimeType: file.mimeType,
          buffer: file.buffer,
        });
        persistedMedia.push(persisted);
      }

      const attachments = persistedMedia.map((attachment, index) => ({
        ...attachment,
        sortOrder: index,
      }));

      const createdAt = new Date();
      const post = await prisma.newsPost.create({
        data: {
          tenantId: req.user!.tenantId,
          authorId: req.user!.userId,
          title,
          body,
          status: NewsStatus.PUBLISHED,
          publishedAt: createdAt,
          attachments: attachments.length > 0 ? { create: attachments } : undefined,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
            },
          },
          attachments: {
            orderBy: {
              sortOrder: "asc",
            },
          },
          likes: {
            where: {
              userId: req.user!.userId,
            },
            select: {
              id: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
      });

      await notifyUsersAboutPost({
        tenantId: req.user!.tenantId,
        authorId: req.user!.userId,
        postId: post.id,
        title: post.title,
      });

      await logAudit({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        action: "NEWS_POST_CREATED",
        entityType: "NewsPost",
        entityId: String(post.id),
        requestId: req.requestId,
      });

      res.status(201).json({ post: buildPostResponse(post) });
    } catch (error) {
      await cleanupPersistedMedia(persistedMedia);
      throw error;
    }
  })
);

router.patch(
  "/posts/:postId",
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);
    const body = assertString(req.body.body, "body");
    const titleRaw = readOptionalTrimmed(req.body.title);

    const existing = await prisma.newsPost.findFirst({
      where: {
        id: postId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!existing) {
      throw notFound("News post not found");
    }

    if (existing.authorId !== req.user!.userId) {
      throw forbidden("Only author can edit this post");
    }

    const updated = await prisma.newsPost.update({
      where: { id: postId },
      data: {
        body,
        title: titleRaw.length > 0 ? titleRaw.slice(0, 140) : derivePostTitle(existing.title, body),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        attachments: {
          orderBy: {
            sortOrder: "asc",
          },
        },
        likes: {
          where: {
            userId: req.user!.userId,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_POST_UPDATED",
      entityType: "NewsPost",
      entityId: String(updated.id),
      requestId: req.requestId,
    });

    res.json({ post: buildPostResponse(updated) });
  })
);

router.delete(
  "/posts/:postId",
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);

    const existing = await prisma.newsPost.findFirst({
      where: {
        id: postId,
        tenantId: req.user!.tenantId,
      },
      include: {
        attachments: true,
      },
    });

    if (!existing) {
      throw notFound("News post not found");
    }

    if (existing.authorId !== req.user!.userId) {
      throw forbidden("Only author can delete this post");
    }

    await prisma.$transaction(async (tx) => {
      await tx.newsPostLike.deleteMany({
        where: {
          postId,
        },
      });

      await tx.newsComment.deleteMany({
        where: {
          postId,
        },
      });

      await tx.newsAttachment.deleteMany({
        where: {
          postId,
        },
      });

      await tx.newsPost.delete({
        where: {
          id: postId,
        },
      });
    });

    await Promise.all(existing.attachments.map((attachment) => removeUploadedFileByUrl(attachment.fileUrl)));

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_POST_DELETED",
      entityType: "NewsPost",
      entityId: String(postId),
      requestId: req.requestId,
    });

    res.json({ ok: true });
  })
);

router.post(
  "/posts/:postId/likes",
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);
    await assertPostExists(req.user!.tenantId, postId);

    await prisma.newsPostLike.upsert({
      where: {
        postId_userId: {
          postId,
          userId: req.user!.userId,
        },
      },
      update: {},
      create: {
        tenantId: req.user!.tenantId,
        postId,
        userId: req.user!.userId,
      },
    });

    const likesCount = await prisma.newsPostLike.count({
      where: {
        postId,
      },
    });

    res.json({
      liked: true,
      likesCount,
    });
  })
);

router.delete(
  "/posts/:postId/likes",
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);
    await assertPostExists(req.user!.tenantId, postId);

    await prisma.newsPostLike.deleteMany({
      where: {
        postId,
        userId: req.user!.userId,
      },
    });

    const likesCount = await prisma.newsPostLike.count({
      where: {
        postId,
      },
    });

    res.json({
      liked: false,
      likesCount,
    });
  })
);

router.get(
  "/posts/:postId/comments",
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);
    await assertPostExists(req.user!.tenantId, postId);

    const limit = parseLimit(req.query.limit, COMMENT_DEFAULT_LIMIT, COMMENT_MAX_LIMIT);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";

    if (cursor) {
      const cursorExists = await prisma.newsComment.findFirst({
        where: {
          id: cursor,
          tenantId: req.user!.tenantId,
          postId,
        },
        select: {
          id: true,
        },
      });

      if (!cursorExists) {
        throw badRequest("Invalid comments cursor");
      }
    }

    const items = await prisma.newsComment.findMany({
      where: {
        tenantId: req.user!.tenantId,
        postId,
      },
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      take: limit,
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const nextCursor = items.length === limit ? items[items.length - 1]?.id ?? null : null;

    res.json({
      items,
      nextCursor,
    });
  })
);

router.post(
  "/posts/:postId/comments",
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);
    const body = assertString(req.body.body, "body");
    const post = await assertPostExists(req.user!.tenantId, postId);

    const comment = await prisma.newsComment.create({
      data: {
        tenantId: req.user!.tenantId,
        postId,
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

    if (post.authorId !== req.user!.userId) {
      await prisma.inAppNotification.create({
        data: {
          tenantId: req.user!.tenantId,
          userId: post.authorId,
          type: NotificationType.NEWS,
          title: "Комментарий к вашему посту",
          body: body.slice(0, 160),
          payload: {
            postId,
            commentId: comment.id,
          } as Prisma.InputJsonValue,
        },
      });
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_COMMENT_CREATED",
      entityType: "NewsComment",
      entityId: comment.id,
      requestId: req.requestId,
      metadata: {
        postId,
      },
    });

    res.status(201).json({ comment });
  })
);

router.delete(
  "/comments/:commentId",
  asyncHandler(async (req, res) => {
    const commentId = req.params.commentId;
    if (!commentId) {
      throw badRequest("commentId is required");
    }

    const comment = await prisma.newsComment.findFirst({
      where: {
        id: commentId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!comment) {
      throw notFound("Comment not found");
    }

    if (comment.authorId !== req.user!.userId) {
      throw forbidden("Only author can delete this comment");
    }

    await prisma.newsComment.delete({
      where: {
        id: comment.id,
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_COMMENT_DELETED",
      entityType: "NewsComment",
      entityId: comment.id,
      requestId: req.requestId,
      metadata: {
        postId: comment.postId,
      },
    });

    res.json({ ok: true });
  })
);

router.get(
  "/stories",
  asyncHandler(async (req, res) => {
    const now = new Date();

    const stories = await prisma.newsStory.findMany({
      where: {
        tenantId: req.user!.tenantId,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        views: {
          where: {
            userId: req.user!.userId,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            views: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const grouped = new Map<
      number,
      {
        author: { id: number; name: string };
        stories: Array<{
          id: string;
          caption: string | null;
          mediaType: string;
          fileUrl: string;
          createdAt: Date;
          expiresAt: Date;
          viewedByMe: boolean;
          viewsCount: number;
        }>;
        lastStoryAt: Date;
        hasUnseen: boolean;
      }
    >();

    for (const story of stories) {
      const viewedByMe = story.views.length > 0;
      const entry = grouped.get(story.author.id);

      const storyDto = {
        id: story.id,
        caption: story.caption,
        mediaType: story.mediaType,
        fileUrl: story.fileUrl,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewedByMe,
        viewsCount: story._count.views,
      };

      if (!entry) {
        grouped.set(story.author.id, {
          author: story.author,
          stories: [storyDto],
          lastStoryAt: story.createdAt,
          hasUnseen: !viewedByMe,
        });
        continue;
      }

      entry.stories.push(storyDto);
      if (story.createdAt > entry.lastStoryAt) {
        entry.lastStoryAt = story.createdAt;
      }
      if (!viewedByMe) {
        entry.hasUnseen = true;
      }
    }

    const items = Array.from(grouped.values()).sort((left, right) => {
      if (left.hasUnseen !== right.hasUnseen) {
        return left.hasUnseen ? -1 : 1;
      }
      return right.lastStoryAt.getTime() - left.lastStoryAt.getTime();
    });

    res.json({ items });
  })
);

router.post(
  "/stories",
  parseNewsStoryMedia,
  asyncHandler(async (req, res) => {
    const uploadedFiles = getUploadedFiles(req);
    let persistedStoryMedia: Awaited<ReturnType<typeof persistNewsMedia>> | null = null;
    try {
      if (uploadedFiles.length !== 1) {
        throw badRequest("Story must contain exactly one media file");
      }

      const file = uploadedFiles[0];
      persistedStoryMedia = await persistNewsMedia({
        kind: "story",
        originalName: file.originalName,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });

      const caption = readOptionalTrimmed(req.body.caption).slice(0, 240);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + STORY_TTL_HOURS * 60 * 60 * 1000);

      const story = await prisma.newsStory.create({
        data: {
          tenantId: req.user!.tenantId,
          authorId: req.user!.userId,
          caption: caption.length > 0 ? caption : null,
          mediaType: persistedStoryMedia.mediaType,
          fileName: persistedStoryMedia.fileName,
          fileUrl: persistedStoryMedia.fileUrl,
          mimeType: persistedStoryMedia.mimeType,
          sizeBytes: persistedStoryMedia.sizeBytes,
          expiresAt,
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

      await logAudit({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        action: "NEWS_STORY_CREATED",
        entityType: "NewsStory",
        entityId: story.id,
        requestId: req.requestId,
      });

      res.status(201).json({ story });
    } catch (error) {
      if (persistedStoryMedia) {
        await cleanupPersistedMedia([persistedStoryMedia]);
      }
      throw error;
    }
  })
);

router.post(
  "/stories/:storyId/view",
  asyncHandler(async (req, res) => {
    const storyId = req.params.storyId;
    if (!storyId) {
      throw badRequest("storyId is required");
    }

    const story = await prisma.newsStory.findFirst({
      where: {
        id: storyId,
        tenantId: req.user!.tenantId,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    if (!story) {
      throw notFound("Story not found");
    }

    const view = await prisma.newsStoryView.upsert({
      where: {
        storyId_userId: {
          storyId,
          userId: req.user!.userId,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        tenantId: req.user!.tenantId,
        storyId,
        userId: req.user!.userId,
      },
    });

    res.json({
      ok: true,
      viewedAt: view.viewedAt,
    });
  })
);

router.delete(
  "/stories/:storyId",
  asyncHandler(async (req, res) => {
    const storyId = req.params.storyId;
    if (!storyId) {
      throw badRequest("storyId is required");
    }

    const story = await prisma.newsStory.findFirst({
      where: {
        id: storyId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!story) {
      throw notFound("Story not found");
    }

    if (story.authorId !== req.user!.userId) {
      throw forbidden("Only author can delete this story");
    }

    await prisma.$transaction(async (tx) => {
      await tx.newsStoryView.deleteMany({
        where: {
          storyId: story.id,
        },
      });

      await tx.newsStory.delete({
        where: {
          id: story.id,
        },
      });
    });

    await removeUploadedFileByUrl(story.fileUrl);

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "NEWS_STORY_DELETED",
      entityType: "NewsStory",
      entityId: story.id,
      requestId: req.requestId,
    });

    res.json({ ok: true });
  })
);

router.patch(
  "/:postId/publish",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const postId = parsePostId(req.params.postId);

    const post = await prisma.newsPost.findFirst({
      where: {
        id: postId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!post) {
      throw notFound("News post not found");
    }

    if (post.status === NewsStatus.PUBLISHED) {
      res.json({ post });
      return;
    }

    const updated = await prisma.newsPost.update({
      where: {
        id: postId,
      },
      data: {
        status: NewsStatus.PUBLISHED,
        publishedAt: post.publishedAt ?? new Date(),
      },
    });

    await notifyUsersAboutPost({
      tenantId: req.user!.tenantId,
      authorId: req.user!.userId,
      postId: updated.id,
      title: updated.title,
    });

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
