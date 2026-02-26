import { ChatMediaType, NotificationType, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, customError, notFound, unauthorized } from "../lib/errors";
import {
  CHAT_VIDEO_NOTE_MAX_DURATION_SEC,
  CHAT_VOICE_MAX_DURATION_SEC,
  persistChatMessageMedia,
  persistChatTopicPhoto,
  removeUploadedFileByUrl,
  validateChatMessageMediaFile,
} from "../lib/media-storage";
import { sendPushNotifications } from "../lib/push";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";
import { getUploadedFiles, parseChatMessageMedia, parseChatTopicPhoto } from "../middlewares/upload";

const router = Router();
router.use(requireAuth);

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

interface ChatMessageAttachmentDto {
  id: string;
  mediaType: ChatMediaType;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  width: number | null;
  height: number | null;
}

interface ChatMessageAuthor {
  id: number;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
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
  attachments: ChatMessageAttachmentDto[];
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

const DIRECT_ROOM_NAME_PATTERN = /^dm:\d+:\d+$/;

const resolveRoomPresentation = (
  room: {
    id: string;
    name: string;
    isPrivate: boolean;
    members: Array<{
      id: number;
      user: {
        id: number;
        name: string;
        role: UserRole;
        avatarUrl: string | null;
      };
    }>;
  },
  currentUserId: number
) => {
  const peerMember = room.isPrivate
    ? room.members.find((member) => member.user.id !== currentUserId) ?? null
    : null;

  const kind = room.isPrivate ? "DIRECT" : "TOPIC";
  const title = room.isPrivate
    ? peerMember?.user.name?.trim() ||
      (DIRECT_ROOM_NAME_PATTERN.test(room.name) ? "Личный чат" : room.name) ||
      "Личный чат"
    : room.name;

  return {
    kind,
    title,
    peer: peerMember
      ? {
          id: peerMember.user.id,
          name: peerMember.user.name,
          role: peerMember.user.role,
          avatarUrl: peerMember.user.avatarUrl,
        }
      : null,
  } as const;
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
  attachments?: Array<{
    id: string;
    mediaType: ChatMediaType;
    fileUrl: string;
    mimeType: string;
    sizeBytes: number;
    durationSec: number;
    width: number | null;
    height: number | null;
  }>;
}): ChatMessageDto => {
  const replyTo = message.replyTo
    ? {
        id: message.replyTo.id,
        bodyPreview: (message.replyTo.isDeleted ? "" : message.replyTo.body).slice(0, 140),
        authorName: message.replyTo.author.name,
        isDeleted: Boolean(message.replyTo.isDeleted),
      }
    : null;

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    isEdited: Boolean(message.isEdited),
    editedAt: message.editedAt ?? null,
    isDeleted: Boolean(message.isDeleted),
    author: message.author,
    replyTo,
    attachments: (message.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      mediaType: attachment.mediaType,
      fileUrl: attachment.fileUrl,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      durationSec: attachment.durationSec,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    })),
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

const canManageTopicRoom = (room: { isPrivate: boolean; createdByUserId: number | null }, user: { userId: number; role: UserRole }) => {
  if (room.isPrivate) {
    throw badRequest("Topic photo is available only for topic rooms");
  }

  if (room.createdByUserId === user.userId) {
    return;
  }

  if (user.role === "CHAIRMAN" || user.role === "ADMIN") {
    return;
  }

  throw customError(403, "TOPIC_PHOTO_NOT_ALLOWED", "Only topic owner or admins can change topic photo");
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
    return [] as number[];
  }

  const mentionedUserIds = await resolveMentionedUserIds(tx, {
    tenantId: params.tenantId,
    body: params.messageBody,
    excludeUserId: params.authorId,
  });

  if (mentionedUserIds.length === 0) {
    return [] as number[];
  }

  await tx.chatMessageMention.createMany({
    data: mentionedUserIds.map((userId) => ({
      tenantId: params.tenantId,
      messageId: params.messageId,
      mentionedUserId: userId,
    })),
    skipDuplicates: true,
  });

  return mentionedUserIds;
};

const dispatchMessageNotifications = async (params: {
  tenantId: number;
  room: { id: string; name: string; isPrivate: boolean };
  authorId: number;
  authorName: string;
  messageId: string;
  messageBody: string;
  replyToMessageId?: string | null;
  mentionUserIds?: number[];
}) => {
  const baseRecipientIds = new Set<number>();

  if (params.room.isPrivate) {
    const members = await prisma.chatRoomMember.findMany({
      where: {
        tenantId: params.tenantId,
        roomId: params.room.id,
        userId: {
          not: params.authorId,
        },
      },
      select: {
        userId: true,
      },
    });

    for (const member of members) {
      baseRecipientIds.add(member.userId);
    }
  } else {
    const users = await prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        isActive: true,
        id: {
          not: params.authorId,
        },
      },
      select: {
        id: true,
      },
      take: 5000,
    });

    const muted = await prisma.chatRoomNotificationSetting.findMany({
      where: {
        tenantId: params.tenantId,
        roomId: params.room.id,
        isMuted: true,
      },
      select: {
        userId: true,
      },
    });
    const mutedIds = new Set(muted.map((item) => item.userId));

    for (const user of users) {
      if (!mutedIds.has(user.id)) {
        baseRecipientIds.add(user.id);
      }
    }
  }

  if (baseRecipientIds.size === 0) {
    return;
  }

  let replyUserId: number | null = null;
  if (params.replyToMessageId) {
    const replyTarget = await prisma.chatMessage.findFirst({
      where: {
        id: params.replyToMessageId,
        tenantId: params.tenantId,
      },
      select: {
        authorId: true,
      },
    });
    if (replyTarget && replyTarget.authorId !== params.authorId) {
      replyUserId = replyTarget.authorId;
    }
  }

  const mentionedSet = new Set((params.mentionUserIds ?? []).filter((id) => baseRecipientIds.has(id)));
  const notifications = Array.from(baseRecipientIds).map((userId) => {
    const isMention = mentionedSet.has(userId);
    const isReply = replyUserId === userId;
    const isDirect = params.room.isPrivate;

    let title = "Новое сообщение";
    let body = params.room.isPrivate
      ? `${params.authorName}: ${params.messageBody.slice(0, 120)}`
      : `Топик: ${params.room.name}`;
    let reason: "MENTION" | "REPLY" | "DIRECT" | "TOPIC" = isDirect ? "DIRECT" : "TOPIC";

    if (isMention) {
      title = "Вас упомянули в чате";
      body = params.room.isPrivate ? "Личный чат" : `Топик: ${params.room.name}`;
      reason = "MENTION";
    } else if (isReply) {
      title = "Ответ на ваше сообщение";
      body = params.room.isPrivate ? "Личный чат" : `Топик: ${params.room.name}`;
      reason = "REPLY";
    } else if (isDirect) {
      title = "Новое личное сообщение";
      reason = "DIRECT";
    } else {
      title = "Новое сообщение в топике";
      reason = "TOPIC";
    }

    return {
      userId,
      reason,
      title,
      body,
    };
  });

  await prisma.inAppNotification.createMany({
    data: notifications.map((item) => ({
      tenantId: params.tenantId,
      userId: item.userId,
      type: NotificationType.FORUM,
      title: item.title,
      body: item.body,
      payload: {
        roomId: params.room.id,
        messageId: params.messageId,
        reason: item.reason,
      },
    })),
    skipDuplicates: false,
  });

  const tokens = await prisma.pushDeviceToken.findMany({
    where: {
      tenantId: params.tenantId,
      userId: {
        in: notifications.map((item) => item.userId),
      },
    },
    select: {
      token: true,
      userId: true,
    },
  });

  const tokensByUser = new Map<number, string[]>();
  for (const token of tokens) {
    const bucket = tokensByUser.get(token.userId) ?? [];
    bucket.push(token.token);
    tokensByUser.set(token.userId, bucket);
  }

  for (const notification of notifications) {
    const userTokens = tokensByUser.get(notification.userId) ?? [];
    if (userTokens.length === 0) {
      continue;
    }

    await sendPushNotifications({
      tokens: userTokens,
      title: notification.title,
      body: notification.body,
      data: {
        type: "FORUM",
        roomId: params.room.id,
        messageId: params.messageId,
        reason: notification.reason,
      },
    });
  }
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
      AND msg."isDeleted" = false
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
          AND msg."isDeleted" = false
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
        role: true,
        avatarUrl: true,
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
        notificationSettings: {
          where: {
            userId: req.user!.userId,
          },
          select: {
            isMuted: true,
          },
          take: 1,
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                avatarUrl: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          where: {
            isDeleted: false,
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                avatarUrl: true,
              },
            },
            attachments: {
              select: {
                id: true,
                mediaType: true,
                fileUrl: true,
                mimeType: true,
                sizeBytes: true,
                durationSec: true,
                width: true,
                height: true,
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
      items: rooms.map((room) => {
        const mappedMembers = room.members.map((member) => ({
          id: member.id,
          user: member.user,
        }));
        const presentation = resolveRoomPresentation(
          {
            id: room.id,
            name: room.name,
            isPrivate: room.isPrivate,
            members: mappedMembers,
          },
          req.user!.userId
        );

        return {
          ...room,
          kind: presentation.kind,
          title: presentation.title,
          peer: presentation.peer,
          photoUrl: room.photoUrl,
          isMuted: room.notificationSettings[0]?.isMuted ?? false,
          members: mappedMembers,
          lastMessage: room.messages[0] ? toMessageDto(room.messages[0]) : null,
          unreadCount: byRoom.get(room.id)?.unreadCount ?? 0,
          lastReadAt: byRoom.get(room.id)?.lastReadAt ?? null,
          notificationSettings: undefined,
          messages: undefined,
        };
      }),
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
          createdByUserId: req.user!.userId,
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
        avatarUrl: true,
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
          createdByUserId: req.user!.userId,
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
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!hydrated) {
      throw notFound("Room not found");
    }

    const mappedMembers = hydrated.members.map((member) => ({
      id: member.id,
      user: member.user,
    }));

    const presentation = resolveRoomPresentation(
      {
        id: hydrated.id,
        name: hydrated.name,
        isPrivate: hydrated.isPrivate,
        members: mappedMembers,
      },
      req.user!.userId
    );

    res.status(201).json({
      room: {
        ...hydrated,
        kind: presentation.kind,
        title: presentation.title,
        peer: presentation.peer,
        photoUrl: hydrated.photoUrl,
        isMuted: false,
        members: mappedMembers,
      },
    });
  })
);

router.patch(
  "/rooms/:roomId/notifications",
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);
    const mutedRaw = req.body.muted;
    const muted =
      typeof mutedRaw === "boolean"
        ? mutedRaw
        : typeof mutedRaw === "string"
          ? mutedRaw.trim().toLowerCase() === "true"
          : null;

    if (muted === null) {
      throw badRequest("muted must be true or false");
    }

    const setting = await prisma.chatRoomNotificationSetting.upsert({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: req.user!.userId,
        },
      },
      update: {
        isMuted: muted,
      },
      create: {
        tenantId: req.user!.tenantId,
        roomId: room.id,
        userId: req.user!.userId,
        isMuted: muted,
      },
    });

    res.json({
      ok: true,
      roomId: room.id,
      isMuted: setting.isMuted,
    });
  })
);

router.post(
  "/rooms/:roomId/photo",
  parseChatTopicPhoto,
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);
    canManageTopicRoom(room, req.user!);

    const files = getUploadedFiles(req);
    if (files.length !== 1) {
      throw badRequest("Topic photo file is required");
    }

    const file = files[0];
    const persisted = await persistChatTopicPhoto({
      originalName: file.originalName,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });

    try {
      const updated = await prisma.chatRoom.update({
        where: {
          id: room.id,
        },
        data: {
          photoUrl: persisted.fileUrl,
          photoUpdatedAt: new Date(),
        },
        select: {
          id: true,
          photoUrl: true,
        },
      });

      if (room.photoUrl && room.photoUrl !== persisted.fileUrl) {
        await removeUploadedFileByUrl(room.photoUrl);
      }

      await logAudit({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        action: "CHAT_TOPIC_PHOTO_UPDATED",
        entityType: "ChatRoom",
        entityId: room.id,
        requestId: req.requestId,
      });

      res.json({
        ok: true,
        roomId: updated.id,
        photoUrl: updated.photoUrl,
      });
    } catch (error) {
      await removeUploadedFileByUrl(persisted.fileUrl);
      throw error;
    }
  })
);

router.delete(
  "/rooms/:roomId/photo",
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);
    canManageTopicRoom(room, req.user!);

    const oldPhotoUrl = room.photoUrl;
    await prisma.chatRoom.update({
      where: {
        id: room.id,
      },
      data: {
        photoUrl: null,
        photoUpdatedAt: new Date(),
      },
    });

    if (oldPhotoUrl) {
      await removeUploadedFileByUrl(oldPhotoUrl);
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "CHAT_TOPIC_PHOTO_REMOVED",
      entityType: "ChatRoom",
      entityId: room.id,
      requestId: req.requestId,
    });

    res.json({
      ok: true,
      roomId: room.id,
      photoUrl: null,
    });
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
        isDeleted: false,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            mediaType: true,
            fileUrl: true,
            mimeType: true,
            sizeBytes: true,
            durationSec: true,
            width: true,
            height: true,
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

    const result = await prisma.$transaction(async (tx) => {
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
              avatarUrl: true,
            },
          },
          attachments: {
            select: {
              id: true,
              mediaType: true,
              fileUrl: true,
              mimeType: true,
              sizeBytes: true,
              durationSec: true,
              width: true,
              height: true,
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

      const mentionUserIds = await syncMentionsAndNotifications(tx, {
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

      return {
        message: created,
        mentionUserIds,
      };
    });
    await dispatchMessageNotifications({
      tenantId: req.user!.tenantId,
      room,
      authorId: req.user!.userId,
      authorName: result.message.author.name,
      messageId: result.message.id,
      messageBody: result.message.body,
      replyToMessageId: result.message.replyTo?.id ?? null,
      mentionUserIds: result.mentionUserIds,
    }).catch(() => undefined);

    res.status(201).json({ message: toMessageDto(result.message) });
  })
);

router.post(
  "/rooms/:roomId/messages/media",
  parseChatMessageMedia,
  asyncHandler(async (req, res) => {
    const room = await canAccessRoom(req.user!.tenantId, req.user!.userId, req.params.roomId);
    const files = getUploadedFiles(req);
    if (files.length !== 1) {
      throw badRequest("Media file is required");
    }

    const mediaFile = files[0];
    const kindRaw = typeof req.body.kind === "string" ? req.body.kind.trim().toLowerCase() : "";
    const kind = kindRaw === "voice"
      ? "voice"
      : kindRaw === "video-note" || kindRaw === "video_note" || kindRaw === "video"
        ? "video-note"
        : null;

    if (!kind) {
      throw badRequest("kind must be voice or video-note");
    }

    const durationSec = Number(req.body.durationSec);
    if (!Number.isFinite(durationSec)) {
      throw badRequest("durationSec must be a number");
    }

    const widthRaw = req.body.width;
    const heightRaw = req.body.height;
    const width = widthRaw === undefined || widthRaw === null || widthRaw === "" ? null : Number(widthRaw);
    const height = heightRaw === undefined || heightRaw === null || heightRaw === "" ? null : Number(heightRaw);
    if (width !== null && !Number.isFinite(width)) {
      throw badRequest("width must be a number");
    }
    if (height !== null && !Number.isFinite(height)) {
      throw badRequest("height must be a number");
    }

    validateChatMessageMediaFile({
      kind,
      mimeType: mediaFile.mimeType,
      size: mediaFile.size,
      durationSec,
    });

    const caption = typeof req.body.caption === "string" ? req.body.caption.trim() : "";
    if (caption.length > 4000) {
      throw badRequest("Message caption is too long");
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

    const persisted = await persistChatMessageMedia({
      kind,
      originalName: mediaFile.originalName,
      mimeType: mediaFile.mimeType,
      buffer: mediaFile.buffer,
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.chatMessage.create({
          data: {
            tenantId: req.user!.tenantId,
            roomId: room.id,
            authorId: req.user!.userId,
            body: caption || (kind === "voice" ? "🎤 Голосовое сообщение" : "🎥 Видеосообщение"),
            replyToMessageId: replyToMessageId || null,
            attachments: {
              create: {
                tenantId: req.user!.tenantId,
                authorId: req.user!.userId,
                mediaType: persisted.mediaType,
                fileUrl: persisted.fileUrl,
                mimeType: persisted.mimeType,
                sizeBytes: persisted.sizeBytes,
                durationSec: Math.round(durationSec),
                width: width ? Math.round(width) : null,
                height: height ? Math.round(height) : null,
              },
            },
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
                avatarUrl: true,
              },
            },
            attachments: {
              select: {
                id: true,
                mediaType: true,
                fileUrl: true,
                mimeType: true,
                sizeBytes: true,
                durationSec: true,
                width: true,
                height: true,
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

        const mentionUserIds = caption
          ? await syncMentionsAndNotifications(tx, {
              tenantId: req.user!.tenantId,
              room,
              messageId: created.id,
              messageBody: caption,
              authorId: req.user!.userId,
            })
          : [];

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

        return {
          message: created,
          mentionUserIds,
        };
      });

      await logAudit({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        action: kind === "voice" ? "CHAT_VOICE_MESSAGE_CREATED" : "CHAT_VIDEO_NOTE_CREATED",
        entityType: "ChatMessage",
        entityId: result.message.id,
        requestId: req.requestId,
        metadata: {
          roomId: room.id,
          durationSec: Math.round(durationSec),
          maxDurationSec: kind === "voice" ? CHAT_VOICE_MAX_DURATION_SEC : CHAT_VIDEO_NOTE_MAX_DURATION_SEC,
        },
      });

      await dispatchMessageNotifications({
        tenantId: req.user!.tenantId,
        room,
        authorId: req.user!.userId,
        authorName: result.message.author.name,
        messageId: result.message.id,
        messageBody: result.message.body,
        replyToMessageId: result.message.replyTo?.id ?? null,
        mentionUserIds: result.mentionUserIds,
      }).catch(() => undefined);

      res.status(201).json({ message: toMessageDto(result.message) });
    } catch (error) {
      await removeUploadedFileByUrl(persisted.fileUrl);
      throw error;
    }
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
              avatarUrl: true,
            },
          },
          attachments: {
            select: {
              id: true,
              mediaType: true,
              fileUrl: true,
              mimeType: true,
              sizeBytes: true,
              durationSec: true,
              width: true,
              height: true,
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
    const isModerator = req.user!.role === "CHAIRMAN" || req.user!.role === "ADMIN";

    if (!isAuthor && !isModerator) {
      throw customError(403, "DELETE_NOT_ALLOWED", "Only author or moderators can delete this message");
    }

    if (!isAuthor && existing.room.isPrivate) {
      throw customError(403, "DELETE_NOT_ALLOWED", "Moderators can delete foreign messages only in topic rooms");
    }

    const deletedAttachmentUrls = await prisma.$transaction(async (tx) => {
      const attachments = await tx.chatMessageAttachment.findMany({
        where: {
          tenantId: req.user!.tenantId,
          messageId: existing.id,
        },
        select: {
          fileUrl: true,
        },
      });

      await tx.chatMessageMention.deleteMany({
        where: {
          tenantId: req.user!.tenantId,
          messageId: existing.id,
        },
      });

      await tx.chatMessageAttachment.deleteMany({
        where: {
          tenantId: req.user!.tenantId,
          messageId: existing.id,
        },
      });

      await tx.chatMessage.delete({
        where: {
          id: existing.id,
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

      return attachments.map((item) => item.fileUrl);
    });

    for (const fileUrl of deletedAttachmentUrls) {
      await removeUploadedFileByUrl(fileUrl);
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: isAuthor ? "CHAT_MESSAGE_DELETED_SELF" : "CHAT_MESSAGE_DELETED_BY_MODERATOR",
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
