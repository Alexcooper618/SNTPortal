import { NotificationType, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, customError, notFound, unauthorized } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETED_MESSAGE_PLACEHOLDER = "Сообщение удалено";

interface ChatMessageAuthor {
  id: number;
  name: string;
  role: UserRole;
}

interface ChatMessageDto {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  isEdited: boolean;
  editedAt: Date | null;
  isDeleted: boolean;
  author: ChatMessageAuthor;
  replyTo: {
    id: string;
    bodyPreview: string;
    authorName: string;
    isDeleted: boolean;
  } | null;
}

const parseOptionalIsoDate = (value: unknown, field: string): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw badRequest(`${field} must be an ISO string`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`${field} must be a valid ISO datetime`);
  }

  return parsed;
};

const normalizeMentionKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^\p{L}\p{N}+ ]/gu, "")
    .replace(/\s+/g, "")
    .trim();

const normalizePhoneLike = (value: string) => value.replace(/[^+\d]/g, "").trim();

const extractMentionTokens = (value: string): string[] => {
  const tokens = new Set<string>();
  const regex = /(^|\s)@([^\s@]{1,64})/gu;

  for (const match of value.matchAll(regex)) {
    const token = match[2]?.trim();
    if (token) {
      tokens.add(token);
    }
  }

  return [...tokens];
};

const toMessageDto = (message: {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  isEdited?: boolean;
  editedAt?: Date | null;
  isDeleted?: boolean;
  author: ChatMessageAuthor;
  replyTo?: {
    id: string;
    body: string;
    isDeleted?: boolean;
    author: {
      name: string;
    };
  } | null;
}): ChatMessageDto => {
  const isDeleted = Boolean(message.isDeleted);
  const replyTo = message.replyTo
    ? {
        id: message.replyTo.id,
        bodyPreview: (message.replyTo.isDeleted ? DELETED_MESSAGE_PLACEHOLDER : message.replyTo.body).slice(0, 140),
        authorName: message.replyTo.author.name,
        isDeleted: Boolean(message.replyTo.isDeleted),
      }
    : null;

  return {
    id: message.id,
    body: isDeleted ? DELETED_MESSAGE_PLACEHOLDER : message.body,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    isEdited: Boolean(message.isEdited),
    editedAt: message.editedAt ?? null,
    isDeleted,
    author: message.author,
    replyTo,
  };
};

const upsertRoomRead = async (
  client: { $executeRaw: typeof prisma.$executeRaw },
  params: { tenantId: number; roomId: string; userId: number; readAt: Date }
) => {
  await client.$executeRaw`
    INSERT INTO "ChatRoomRead" ("tenantId", "roomId", "userId", "lastReadAt", "updatedAt")
    VALUES (${params.tenantId}, ${params.roomId}, ${params.userId}, ${params.readAt}, NOW())
    ON CONFLICT ("roomId", "userId")
    DO UPDATE SET
      "lastReadAt" = GREATEST("ChatRoomRead"."lastReadAt", EXCLUDED."lastReadAt"),
      "updatedAt" = NOW()
  `;
};

const canAccessRoom = async (tenantId: number, userId: number, roomId: string) => {
  const room = await prisma.chatRoom.findFirst({
    where: {
      id: roomId,
      tenantId,
    },
  });

  if (!room) {
    throw notFound("Room not found");
  }

  if (!room.isPrivate) {
    return room;
  }

  const membership = await prisma.chatRoomMember.findFirst({
    where: {
      tenantId,
      roomId: room.id,
      userId,
    },
  });

  if (!membership) {
    throw unauthorized("Room is private");
  }

  return room;
};

const resolveMentionedUserIds = async (
  tx: Prisma.TransactionClient,
  params: { tenantId: number; body: string; excludeUserId: number }
) => {
  const tokens = extractMentionTokens(params.body);
  if (tokens.length === 0) {
    return [] as number[];
  }

  const users = await tx.user.findMany({
    where: {
      tenantId: params.tenantId,
      isActive: true,
      id: {
        not: params.excludeUserId,
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
    take: 1000,
  });

  const byName = new Map<string, number>();
  const byPhone = new Map<string, number>();

  for (const user of users) {
    const nameKey = normalizeMentionKey(user.name);
    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, user.id);
    }

    const phoneKey = normalizePhoneLike(user.phone);
    if (phoneKey && !byPhone.has(phoneKey)) {
      byPhone.set(phoneKey, user.id);
    }
  }

  const ids = new Set<number>();

  for (const token of tokens) {
    const normalizedPhone = normalizePhoneLike(token);
    const normalizedName = normalizeMentionKey(token);

    if (normalizedPhone && byPhone.has(normalizedPhone)) {
      ids.add(byPhone.get(normalizedPhone)!);
      continue;
    }

    if (normalizedName && byName.has(normalizedName)) {
      ids.add(byName.get(normalizedName)!);
    }
  }

  return [...ids];
};

const syncMentionsAndNotifications = async (
  tx: Prisma.TransactionClient,
  params: {
    tenantId: number;
    room: { id: string; name: string; isPrivate: boolean };
    messageId: string;
    messageBody: string;
    authorId: number;
  }
) => {
  await tx.chatMessageMention.deleteMany({
    where: {
      tenantId: params.tenantId,
      messageId: params.messageId,
    },
  });

  if (params.room.isPrivate) {
    return;
  }

  const mentionedUserIds = await resolveMentionedUserIds(tx, {
    tenantId: params.tenantId,
    body: params.messageBody,
    excludeUserId: params.authorId,
  });

  if (mentionedUserIds.length === 0) {
    return;
  }

  await tx.chatMessageMention.createMany({
    data: mentionedUserIds.map((userId) => ({
      tenantId: params.tenantId,
      messageId: params.messageId,
      mentionedUserId: userId,
    })),
    skipDuplicates: true,
  });

  await tx.inAppNotification.createMany({
    data: mentionedUserIds.map((userId) => ({
      tenantId: params.tenantId,
      userId,
      type: NotificationType.FORUM,
      title: "Вас упомянули в чате",
      body: `Комната: ${params.room.isPrivate ? "Личный чат" : params.room.name}`,
      payload: {
        roomId: params.room.id,
        messageId: params.messageId,
      },
    })),
    skipDuplicates: false,
  });
};

const getUnreadByRoom = async (tenantId: number, userId: number, roomIds: string[]) => {
  if (roomIds.length === 0) {
    return {
      byRoom: new Map<string, { unreadCount: number; lastReadAt: string | null }>(),
      summary: { unreadRooms: 0, unreadMessages: 0 },
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ roomId: string; unreadCount: number; lastReadAt: Date | null }>
  >(Prisma.sql`
    WITH baselines AS (
      SELECT
        r.id AS "roomId",
        rr."lastReadAt" AS "lastReadAt",
        COALESCE(rr."lastReadAt", m."createdAt", u."createdAt") AS "baseline"
      FROM "ChatRoom" r
      LEFT JOIN "ChatRoomRead" rr
        ON rr."roomId" = r.id
        AND rr."userId" = ${userId}
        AND rr."tenantId" = ${tenantId}
      LEFT JOIN "ChatRoomMember" m
        ON m."roomId" = r.id
        AND m."userId" = ${userId}
        AND m."tenantId" = ${tenantId}
      JOIN "User" u ON u.id = ${userId}
      WHERE r.id IN (${Prisma.join(roomIds)})
    )
    SELECT
      b."roomId",
      b."lastReadAt",
      COUNT(*) FILTER (
        WHERE msg."createdAt" > b."baseline"
        AND msg."authorId" <> ${userId}
      )::int AS "unreadCount"
    FROM baselines b
    LEFT JOIN "ChatMessage" msg
      ON msg."roomId" = b."roomId"
      AND msg."tenantId" = ${tenantId}
    GROUP BY b."roomId", b."lastReadAt"
  `);

  const byRoom = new Map<string, { unreadCount: number; lastReadAt: string | null }>();
  let unreadRooms = 0;
  let unreadMessages = 0;

  for (const row of rows) {
    const unreadCount = Number(row.unreadCount ?? 0);
    const lastReadAt = row.lastReadAt ? row.lastReadAt.toISOString() : null;
    byRoom.set(row.roomId, { unreadCount, lastReadAt });
    unreadMessages += unreadCount;
    if (unreadCount > 0) unreadRooms += 1;
  }

  for (const roomId of roomIds) {
    if (!byRoom.has(roomId)) {
      byRoom.set(roomId, { unreadCount: 0, lastReadAt: null });
    }
  }

  return {
    byRoom,
    summary: { unreadRooms, unreadMessages },
  };
};

const getUnreadSummary = async (tenantId: number, userId: number) => {
  const rows = await prisma.$queryRaw<Array<{ unreadRooms: number; unreadMessages: number }>>(
    Prisma.sql`
      WITH accessible_rooms AS (
        SELECT r.id AS "roomId"
        FROM "ChatRoom" r
        LEFT JOIN "ChatRoomMember" m
          ON m."roomId" = r.id
          AND m."userId" = ${userId}
          AND m."tenantId" = ${tenantId}
        WHERE r."tenantId" = ${tenantId}
          AND (r."isPrivate" = false OR m.id IS NOT NULL)
      ),
      baselines AS (
        SELECT
          ar."roomId",
          COALESCE(rr."lastReadAt", m."createdAt", u."createdAt") AS "baseline"
        FROM accessible_rooms ar
        LEFT JOIN "ChatRoomRead" rr
          ON rr."roomId" = ar."roomId"
          AND rr."userId" = ${userId}
          AND rr."tenantId" = ${tenantId}
        LEFT JOIN "ChatRoomMember" m
          ON m."roomId" = ar."roomId"
          AND m."userId" = ${userId}
          AND m."tenantId" = ${tenantId}
        JOIN "User" u ON u.id = ${userId}
      ),
      counts AS (
        SELECT
          b."roomId",
          COUNT(*) FILTER (
            WHERE msg."createdAt" > b."baseline"
            AND msg."authorId" <> ${userId}
          )::int AS "unreadCount"
        FROM baselines b
        LEFT JOIN "ChatMessage" msg
          ON msg."roomId" = b."roomId"
          AND msg."tenantId" = ${tenantId}
        GROUP BY b."roomId"
      )
      SELECT
        COALESCE(SUM(CASE WHEN counts."unreadCount" > 0 THEN 1 ELSE 0 END), 0)::int AS "unreadRooms",
        COALESCE(SUM(counts."unreadCount"), 0)::int AS "unreadMessages"
      FROM counts
    `
  );

  const row = rows[0];
  return {
    unreadRooms: Number(row?.unreadRooms ?? 0),
    unreadMessages: Number(row?.unreadMessages ?? 0),
  };
};

router.get(
  "/unread-summary",
  asyncHandler(async (req, res) => {
    const summary = await getUnreadSummary(req.user!.tenantId, req.user!.userId);
    res.json(summary);
  })
);

router.post(
  "/rooms/:roomId/read",
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);

    const readAt = parseOptionalIsoDate(req.body.readAt, "readAt") ?? new Date();

    await upsertRoomRead(prisma, {
      tenantId: req.user!.tenantId,
      roomId: room.id,
      userId: req.user!.userId,
      readAt,
    });

    res.json({ ok: true, lastReadAt: readAt.toISOString() });
  })
);

router.get(
  "/contacts",
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.user!.tenantId,
        isActive: true,
        id: {
          not: req.user!.userId,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        ownedPlots: {
          select: {
            id: true,
            number: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
      take: 500,
    });

    res.json({ items: users });
  })
);

router.get(
  "/rooms",
  asyncHandler(async (req, res) => {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        tenantId: req.user!.tenantId,
        OR: [
          { isPrivate: false },
          {
            members: {
              some: {
                userId: req.user!.userId,
              },
            },
          },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: "desc",
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
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const roomIds = rooms.map((room) => room.id);
    const { byRoom, summary } = await getUnreadByRoom(req.user!.tenantId, req.user!.userId, roomIds);

    res.json({
      items: rooms.map((room) => ({
        ...room,
        members: room.members.map((member) => ({
          id: member.id,
          user: member.user,
        })),
        lastMessage: room.messages[0] ? toMessageDto(room.messages[0]) : null,
        unreadCount: byRoom.get(room.id)?.unreadCount ?? 0,
        lastReadAt: byRoom.get(room.id)?.lastReadAt ?? null,
        messages: undefined,
      })),
      summary,
    });
  })
);

router.post(
  "/rooms",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const name = assertString(req.body.name, "name");
    const isPrivate = Boolean(req.body.isPrivate);

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.chatRoom.create({
        data: {
          tenantId: req.user!.tenantId,
          name,
          isPrivate,
        },
      });

      if (created.isPrivate) {
        await tx.chatRoomMember.create({
          data: {
            tenantId: req.user!.tenantId,
            roomId: created.id,
            userId: req.user!.userId,
          },
        });
      }

      return created;
    });

    res.status(201).json({ room });
  })
);

router.post(
  "/direct/:userId",
  asyncHandler(async (req, res) => {
    const otherId = Number(req.params.userId);
    if (!Number.isFinite(otherId)) {
      throw badRequest("userId must be a number");
    }

    if (otherId === req.user!.userId) {
      throw badRequest("Cannot create direct chat with yourself");
    }

    const otherUser = await prisma.user.findFirst({
      where: {
        id: otherId,
        tenantId: req.user!.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    if (!otherUser) {
      throw notFound("User not found");
    }

    const a = Math.min(req.user!.userId, otherId);
    const b = Math.max(req.user!.userId, otherId);
    const roomName = `dm:${a}:${b}`;

    const room = await prisma.$transaction(async (tx) => {
      const existing = await tx.chatRoom.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          name: roomName,
          isPrivate: true,
        },
      });

      if (existing) {
        return existing;
      }

      const created = await tx.chatRoom.create({
        data: {
          tenantId: req.user!.tenantId,
          name: roomName,
          isPrivate: true,
        },
      });

      await tx.chatRoomMember.createMany({
        data: [
          {
            tenantId: req.user!.tenantId,
            roomId: created.id,
            userId: req.user!.userId,
          },
          {
            tenantId: req.user!.tenantId,
            roomId: created.id,
            userId: otherId,
          },
        ],
        skipDuplicates: true,
      });

      return created;
    });

    const hydrated = await prisma.chatRoom.findFirst({
      where: {
        id: room.id,
        tenantId: req.user!.tenantId,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({ room: hydrated });
  })
);

router.get(
  "/rooms/:roomId/messages",
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const take = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;

    const messages = await prisma.chatMessage.findMany({
      where: {
        tenantId: req.user!.tenantId,
        roomId: room.id,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        replyTo: {
          include: {
            author: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      take,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      room,
      items: messages.reverse().map((message) => toMessageDto(message)),
    });
  })
);

router.post(
  "/rooms/:roomId/messages",
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);

    const body = assertString(req.body.body, "body");
    if (body.length > 4000) {
      throw badRequest("Message is too long");
    }

    const replyToMessageId = typeof req.body.replyToMessageId === "string" ? req.body.replyToMessageId.trim() : undefined;

    if (replyToMessageId) {
      const parent = await prisma.chatMessage.findFirst({
        where: {
          id: replyToMessageId,
          tenantId: req.user!.tenantId,
          roomId: room.id,
          isDeleted: false,
        },
        select: {
          id: true,
        },
      });

      if (!parent) {
        throw customError(400, "INVALID_REPLY_TARGET", "Reply target is invalid or unavailable");
      }
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          tenantId: req.user!.tenantId,
          roomId: room.id,
          authorId: req.user!.userId,
          body,
          replyToMessageId: replyToMessageId || null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          replyTo: {
            include: {
              author: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      await syncMentionsAndNotifications(tx, {
        tenantId: req.user!.tenantId,
        room,
        messageId: created.id,
        messageBody: created.body,
        authorId: req.user!.userId,
      });

      await tx.chatRoom.update({
        where: {
          id: room.id,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      await upsertRoomRead(tx, {
        tenantId: req.user!.tenantId,
        roomId: room.id,
        userId: req.user!.userId,
        readAt: created.createdAt,
      });

      return created;
    });

    res.status(201).json({ message: toMessageDto(message) });
  })
);

router.patch(
  "/messages/:messageId",
  asyncHandler(async (req, res) => {
    const body = assertString(req.body.body, "body");
    if (body.length > 4000) {
      throw badRequest("Message is too long");
    }

    const existing = await prisma.chatMessage.findFirst({
      where: {
        id: req.params.messageId,
        tenantId: req.user!.tenantId,
      },
      include: {
        room: true,
      },
    });

    if (!existing) {
      throw customError(404, "MESSAGE_NOT_FOUND", "Message not found");
    }

    await canAccessRoom(req.user!.tenantId, req.user!.userId, existing.roomId);

    if (existing.authorId !== req.user!.userId) {
      throw customError(403, "EDIT_NOT_ALLOWED", "Only author can edit message");
    }

    if (existing.isDeleted) {
      throw customError(403, "EDIT_NOT_ALLOWED", "Deleted message cannot be edited");
    }

    if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw customError(400, "EDIT_WINDOW_EXPIRED", "Edit window has expired");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.chatMessage.update({
        where: {
          id: existing.id,
        },
        data: {
          body,
          isEdited: true,
          editedAt: new Date(),
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          replyTo: {
            include: {
              author: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      await syncMentionsAndNotifications(tx, {
        tenantId: req.user!.tenantId,
        room: existing.room,
        messageId: next.id,
        messageBody: next.body,
        authorId: req.user!.userId,
      });

      await tx.chatRoom.update({
        where: {
          id: existing.roomId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      return next;
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "CHAT_MESSAGE_EDITED",
      entityType: "ChatMessage",
      entityId: updated.id,
      requestId: req.requestId,
      metadata: {
        roomId: updated.roomId,
      },
    });

    res.json({ message: toMessageDto(updated) });
  })
);

router.delete(
  "/messages/:messageId",
  asyncHandler(async (req, res) => {
    const existing = await prisma.chatMessage.findFirst({
      where: {
        id: req.params.messageId,
        tenantId: req.user!.tenantId,
      },
      include: {
        room: true,
      },
    });

    if (!existing) {
      throw customError(404, "MESSAGE_NOT_FOUND", "Message not found");
    }

    await canAccessRoom(req.user!.tenantId, req.user!.userId, existing.roomId);

    const isAuthor = existing.authorId === req.user!.userId;
    const isChairman = req.user!.role === "CHAIRMAN";

    if (!isAuthor && !isChairman) {
      throw customError(403, "DELETE_NOT_ALLOWED", "Only author or chairman can delete this message");
    }

    if (!existing.isDeleted) {
      await prisma.$transaction(async (tx) => {
        await tx.chatMessage.update({
          where: {
            id: existing.id,
          },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedByUserId: req.user!.userId,
            isEdited: false,
            editedAt: null,
          },
        });

        await tx.chatMessageMention.deleteMany({
          where: {
            tenantId: req.user!.tenantId,
            messageId: existing.id,
          },
        });

        await tx.chatRoom.update({
          where: {
            id: existing.roomId,
          },
          data: {
            updatedAt: new Date(),
          },
        });
      });
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: isAuthor ? "CHAT_MESSAGE_DELETED_SELF" : "CHAT_MESSAGE_DELETED_BY_CHAIRMAN",
      entityType: "ChatMessage",
      entityId: existing.id,
      requestId: req.requestId,
      metadata: {
        roomId: existing.roomId,
        authorId: existing.authorId,
      },
    });

    res.json({ ok: true });
  })
);

export default router;
