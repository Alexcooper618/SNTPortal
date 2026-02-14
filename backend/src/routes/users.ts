import { Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, customError, notFound } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { hashPassword } from "../lib/password";
import { sanitizeUser } from "../lib/user-safe";
import { assertArray, assertString, normalizePhone } from "../lib/validators";
import { asyncHandler } from "../middlewares/async-handler";
import { requireAuth, requireRole } from "../middlewares/auth";
import { revokeAllUserSessions } from "../services/auth-service";

const router = Router();

router.use(requireAuth);

interface MembershipInput {
  plotId: number;
  isPrimary: boolean;
}

const parseUserId = (raw: string): number => {
  const userId = Number(raw);
  if (!Number.isFinite(userId)) {
    throw badRequest("userId must be a number");
  }
  return userId;
};

const parseOptionalBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  throw badRequest(`${fieldName} must be true/false`);
};

const parseOptionalNumber = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw badRequest(`${fieldName} must be a number`);
  }

  return parsed;
};

const parseMemberships = (value: unknown): MembershipInput[] => {
  const rawMemberships = assertArray<Record<string, unknown>>(value, "memberships");

  const memberships = rawMemberships.map((item) => {
    const plotId = Number(item.plotId);
    if (!Number.isFinite(plotId)) {
      throw badRequest("memberships[].plotId must be a number");
    }

    const isPrimary = item.isPrimary === true;

    return {
      plotId,
      isPrimary,
    };
  });

  const duplicates = new Set<number>();
  const seen = new Set<number>();

  for (const membership of memberships) {
    if (seen.has(membership.plotId)) {
      duplicates.add(membership.plotId);
    }
    seen.add(membership.plotId);
  }

  if (duplicates.size > 0) {
    throw badRequest("memberships contains duplicate plotIds", {
      plotIds: Array.from(duplicates),
    });
  }

  const primaryCount = memberships.filter((membership) => membership.isPrimary).length;
  if (primaryCount > 1) {
    throw badRequest("Only one primary plot membership is allowed");
  }

  return memberships;
};

const includeForAdmin = () => ({
  ownedPlots: {
    select: {
      id: true,
      number: true,
    },
  },
  plotMemberships: {
    where: {
      toDate: null,
    },
    include: {
      plot: {
        select: {
          id: true,
          number: true,
          area: true,
          ownerId: true,
        },
      },
    },
    orderBy: {
      fromDate: "desc" as const,
    },
  },
  sessions: {
    where: {
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
    },
  },
});

const toUserDto = (user: any) => {
  const safeUser = sanitizeUser(user);
  const { sessions, ...rest } = safeUser;

  return {
    ...rest,
    activeSessionsCount: sessions.length,
  };
};

const assertUserExists = async (tenantId: number, userId: number) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
    },
  });

  if (!user) {
    throw customError(404, "USER_NOT_FOUND", "User not found");
  }

  return user;
};

const replaceUserPlotMemberships = async (
  tx: Prisma.TransactionClient,
  tenantId: number,
  userId: number,
  memberships: MembershipInput[]
) => {
  const plotIds = memberships.map((membership) => membership.plotId);

  if (plotIds.length > 0) {
    const plots = await tx.plot.findMany({
      where: {
        tenantId,
        id: {
          in: plotIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (plots.length !== plotIds.length) {
      throw badRequest("Some plots are not found in tenant");
    }
  }

  const now = new Date();

  const activeMemberships = await tx.plotOwnership.findMany({
    where: {
      tenantId,
      userId,
      toDate: null,
    },
    select: {
      id: true,
      plotId: true,
      isPrimary: true,
    },
  });

  const activeByPlot = new Map(activeMemberships.map((item) => [item.plotId, item]));
  const nextByPlot = new Map(memberships.map((item) => [item.plotId, item]));

  const toClose = activeMemberships.filter((item) => !nextByPlot.has(item.plotId)).map((item) => item.id);
  if (toClose.length > 0) {
    await tx.plotOwnership.updateMany({
      where: {
        id: {
          in: toClose,
        },
      },
      data: {
        toDate: now,
        isPrimary: false,
      },
    });
  }

  for (const membership of memberships) {
    const current = activeByPlot.get(membership.plotId);

    if (current) {
      await tx.plotOwnership.update({
        where: {
          id: current.id,
        },
        data: {
          isPrimary: membership.isPrimary,
        },
      });
      continue;
    }

    await tx.plotOwnership.create({
      data: {
        tenantId,
        userId,
        plotId: membership.plotId,
        isPrimary: membership.isPrimary,
        fromDate: now,
      },
    });
  }

  const affectedPlotIds = Array.from(new Set([...activeMemberships.map((item) => item.plotId), ...plotIds]));

  for (const plotId of affectedPlotIds) {
    const primaryOwner = await tx.plotOwnership.findFirst({
      where: {
        tenantId,
        plotId,
        toDate: null,
        isPrimary: true,
      },
      orderBy: {
        fromDate: "desc",
      },
      select: {
        userId: true,
      },
    });

    await tx.plot.update({
      where: {
        id: plotId,
      },
      data: {
        ownerId: primaryOwner?.userId ?? null,
      },
    });
  }
};

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        ownedPlots: true,
      },
    });

    if (!user) {
      throw notFound("User not found");
    }

    const unreadNotifications = await prisma.inAppNotification.count({
      where: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        isRead: false,
      },
    });

    res.json({
      user: sanitizeUser(user),
      unreadNotifications,
    });
  })
);

router.get(
  "/",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const { limit, offset } = getPagination(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const isActive = parseOptionalBoolean(req.query.isActive, "isActive");
    const plotId = parseOptionalNumber(req.query.plotId, "plotId");

    const where: Prisma.UserWhereInput = {
      tenantId: req.user!.tenantId,
    };

    if (typeof isActive === "boolean") {
      where.isActive = isActive;
    }

    if (search.length > 0) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: search,
          },
        },
      ];
    }

    if (typeof plotId === "number") {
      where.plotMemberships = {
        some: {
          plotId,
          toDate: null,
        },
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: includeForAdmin(),
        take: limit,
        skip: offset,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      items: users.map(toUserDto),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  })
);

router.get(
  "/:userId",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const userId = parseUserId(req.params.userId);

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId: req.user!.tenantId,
      },
      include: includeForAdmin(),
    });

    if (!user) {
      throw customError(404, "USER_NOT_FOUND", "User not found");
    }

    const audit = await prisma.auditLog.findMany({
      where: {
        tenantId: req.user!.tenantId,
        OR: [
          {
            entityType: "User",
            entityId: String(userId),
          },
          {
            actorId: userId,
          },
        ],
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    res.json({
      user: toUserDto(user),
      audit,
    });
  })
);

router.post(
  "/",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const name = assertString(req.body.name, "name");
    const phone = normalizePhone(assertString(req.body.phone, "phone"));
    const temporaryPassword = assertString(req.body.temporaryPassword, "temporaryPassword");

    const plotIds =
      req.body.plotIds === undefined ? [] : assertArray<number>(req.body.plotIds, "plotIds").map((item) => Number(item));
    const primaryPlotId = parseOptionalNumber(req.body.primaryPlotId, "primaryPlotId");

    if (req.body.role && String(req.body.role).toUpperCase() !== "USER") {
      throw badRequest("Only USER role can be created from admin panel");
    }

    if (plotIds.length > 0 && primaryPlotId === undefined) {
      throw badRequest("primaryPlotId is required when plotIds are provided");
    }

    if (primaryPlotId !== undefined && !plotIds.includes(primaryPlotId)) {
      throw badRequest("primaryPlotId must be one of plotIds");
    }

    const duplicatePlotIds = plotIds.filter((plotId, index) => plotIds.indexOf(plotId) !== index);
    if (duplicatePlotIds.length > 0) {
      throw badRequest("plotIds contains duplicates", {
        plotIds: Array.from(new Set(duplicatePlotIds)),
      });
    }

    const existing = await prisma.user.findUnique({
      where: {
        tenantId_phone: {
          tenantId: req.user!.tenantId,
          phone,
        },
      },
    });

    if (existing) {
      throw customError(409, "PHONE_ALREADY_EXISTS", "User with this phone already exists");
    }

    const passwordHash = await hashPassword(temporaryPassword);

    const memberships = plotIds.map((plotId) => ({
      plotId,
      isPrimary: plotId === primaryPlotId,
    }));

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: req.user!.tenantId,
          name,
          phone,
          role: UserRole.USER,
          passwordHash,
          mustChangePassword: true,
          passwordUpdatedAt: null,
        },
      });

      if (memberships.length > 0) {
        await replaceUserPlotMemberships(tx, req.user!.tenantId, created.id, memberships);
      }

      return tx.user.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: includeForAdmin(),
      });
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "USER_CREATED_WITH_TEMP_PASSWORD",
      entityType: "User",
      entityId: String(user.id),
      requestId: req.requestId,
      metadata: {
        initialPlotsCount: memberships.length,
      },
    });

    if (memberships.length > 0) {
      await logAudit({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        action: "USER_PLOTS_UPDATED",
        entityType: "User",
        entityId: String(user.id),
        requestId: req.requestId,
        metadata: {
          memberships,
        },
      });
    }

    res.status(201).json({ user: toUserDto(user) });
  })
);

router.patch(
  "/:userId",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const userId = parseUserId(req.params.userId);
    const current = await assertUserExists(req.user!.tenantId, userId);

    const nextName = typeof req.body.name === "string" ? assertString(req.body.name, "name") : undefined;
    const nextPhone =
      typeof req.body.phone === "string" ? normalizePhone(assertString(req.body.phone, "phone")) : undefined;
    const nextActive = parseOptionalBoolean(req.body.isActive, "isActive");

    if (nextName === undefined && nextPhone === undefined && nextActive === undefined) {
      throw badRequest("At least one field (name, phone, isActive) must be provided");
    }

    if (nextPhone && nextPhone !== current.phone) {
      const phoneTaken = await prisma.user.findUnique({
        where: {
          tenantId_phone: {
            tenantId: req.user!.tenantId,
            phone: nextPhone,
          },
        },
      });

      if (phoneTaken && phoneTaken.id !== current.id) {
        throw customError(409, "PHONE_ALREADY_EXISTS", "Phone is already used by another user");
      }
    }

    if (nextActive === false && current.role === "CHAIRMAN") {
      const activeChairmanCount = await prisma.user.count({
        where: {
          tenantId: req.user!.tenantId,
          role: UserRole.CHAIRMAN,
          isActive: true,
        },
      });

      if (activeChairmanCount <= 1) {
        throw customError(400, "CANNOT_DEACTIVATE_LAST_CHAIRMAN", "Cannot deactivate last active chairman");
      }
    }

    const updated = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        name: nextName,
        phone: nextPhone,
        isActive: nextActive,
      },
      include: includeForAdmin(),
    });

    if (current.isActive && updated.isActive === false) {
      await revokeAllUserSessions(req.user!.tenantId, userId);
    }

    const action =
      current.isActive && updated.isActive === false
        ? "USER_DEACTIVATED"
        : current.isActive === false && updated.isActive
        ? "USER_ACTIVATED"
        : "USER_UPDATED_BY_CHAIRMAN";

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action,
      entityType: "User",
      entityId: String(userId),
      requestId: req.requestId,
      metadata: {
        before: {
          name: current.name,
          phone: current.phone,
          isActive: current.isActive,
        },
        after: {
          name: updated.name,
          phone: updated.phone,
          isActive: updated.isActive,
        },
      },
    });

    res.json({ user: toUserDto(updated) });
  })
);

router.post(
  "/:userId/reset-password",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const userId = parseUserId(req.params.userId);
    await assertUserExists(req.user!.tenantId, userId);

    const temporaryPassword = assertString(req.body.temporaryPassword, "temporaryPassword");
    const passwordHash = await hashPassword(temporaryPassword);

    const updated = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      },
      include: includeForAdmin(),
    });

    await revokeAllUserSessions(req.user!.tenantId, userId);

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "USER_PASSWORD_RESET_BY_CHAIRMAN",
      entityType: "User",
      entityId: String(userId),
      requestId: req.requestId,
    });

    res.json({ user: toUserDto(updated) });
  })
);

router.put(
  "/:userId/plots",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const userId = parseUserId(req.params.userId);
    await assertUserExists(req.user!.tenantId, userId);

    const memberships = parseMemberships(req.body.memberships);

    const user = await prisma.$transaction(async (tx) => {
      await replaceUserPlotMemberships(tx, req.user!.tenantId, userId, memberships);

      return tx.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        include: includeForAdmin(),
      });
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "USER_PLOTS_UPDATED",
      entityType: "User",
      entityId: String(userId),
      requestId: req.requestId,
      metadata: {
        memberships,
      },
    });

    res.json({ user: toUserDto(user) });
  })
);

router.patch(
  "/:userId/role",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const userId = parseUserId(req.params.userId);
    const roleRaw = assertString(req.body.role, "role").toUpperCase();

    if (roleRaw !== "USER") {
      throw badRequest("Setting role CHAIRMAN is disabled in admin panel");
    }

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!user) {
      throw customError(404, "USER_NOT_FOUND", "User not found");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: roleRaw as UserRole,
      },
      include: includeForAdmin(),
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "USER_ROLE_UPDATED",
      entityType: "User",
      entityId: String(userId),
      requestId: req.requestId,
      metadata: {
        previousRole: user.role,
        nextRole: updated.role,
      },
    });

    res.json({ user: toUserDto(updated) });
  })
);

export default router;
