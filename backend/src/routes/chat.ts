import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, notFound, unauthorized } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

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

  // Ensure all roomIds exist in the map.
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
        lastMessage: room.messages[0] ?? null,
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

      // If the room is private, add the creator as a member; otherwise it's unreachable.
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
      },
      take,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      room,
      items: messages.reverse(),
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

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          tenantId: req.user!.tenantId,
          roomId: room.id,
          authorId: req.user!.userId,
          body,
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
      });

      await tx.chatRoom.update({
        where: {
          id: room.id,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      // Do not accumulate unread for author's own messages.
      await upsertRoomRead(tx, {
        tenantId: req.user!.tenantId,
        roomId: room.id,
        userId: req.user!.userId,
        readAt: created.createdAt,
      });

      return created;
    });

    res.status(201).json({ message });
  })
);

export default router;
