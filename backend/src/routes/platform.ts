import { Prisma, TenantStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, customError } from "../lib/errors";
import { getPagination } from "../lib/pagination";
import { assertString, normalizePhone } from "../lib/validators";
import { asyncHandler } from "../middlewares/async-handler";
import { requireAuth, requireRole } from "../middlewares/auth";
import { hashPassword } from "../lib/password";
import { revokeAllUserSessions } from "../services/auth-service";

const router = Router();

router.use(requireAuth);
router.use(requireRole("ADMIN"));

const CORE_CHAT_ROOMS = [
  { name: "Общий чат", isPrivate: false },
  { name: "Вопрос председателю", isPrivate: false },
] as const;

const parseId = (raw: string, field: string) => {
  const id = Number(raw);
  if (!Number.isFinite(id)) throw badRequest(`${field} must be a number`);
  return id;
};

const parseOptionalEnum = <T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const normalized = value.trim().toUpperCase();
  const match = allowed.find((item) => item.toUpperCase() === normalized);
  if (!match) throw badRequest(`${field} must be one of: ${allowed.join(", ")}`);
  return match;
};

const parseOptionalBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  throw badRequest(`${fieldName} must be true/false`);
};

const parseOptionalNumber = (value: unknown, field: string): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${field} must be a number`);
  return parsed;
};

const assertLatLon = (latitude?: number, longitude?: number) => {
  if (latitude === undefined && longitude === undefined) return;
  if (latitude === undefined || longitude === undefined) {
    throw badRequest("Both latitude and longitude must be provided together");
  }
  if (latitude < -90 || latitude > 90) throw badRequest("latitude must be between -90 and 90");
  if (longitude < -180 || longitude > 180) throw badRequest("longitude must be between -180 and 180");
};

const resolveTimeZoneAuto = async (latitude: number, longitude: number): Promise<string | null> => {
  // Uses the same provider as weather to avoid bundling a timezone polygon database.
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m",
    timezone: "auto",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const response = await fetch(url, { headers: { "User-Agent": "snt-portal/1.0" } });
  if (!response.ok) return null;
  const data = (await response.json()) as any;
  const tz = typeof data?.timezone === "string" ? data.timezone.trim() : "";
  return tz.length > 0 ? tz : null;
};

router.get(
  "/tenants",
  asyncHandler(async (req, res) => {
    const { limit, offset } = getPagination(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = parseOptionalEnum(req.query.status, ["ACTIVE", "ARCHIVED"] as const, "status");

    const where: Prisma.TenantWhereInput = {
      ...(status ? { status: status as TenantStatus } : {}),
      ...(search.length > 0
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { address: { contains: search, mode: "insensitive" } },
              { location: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          location: true,
          address: true,
          latitude: true,
          longitude: true,
          timeZone: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    res.json({
      items,
      pagination: { total, limit, offset },
    });
  })
);

router.post(
  "/tenants",
  asyncHandler(async (req, res) => {
    const name = assertString(req.body.name, "name");
    const slug = assertString(req.body.slug, "slug").toLowerCase();
    const location = typeof req.body.location === "string" ? req.body.location.trim() : undefined;
    const address = typeof req.body.address === "string" ? req.body.address.trim() : undefined;
    const latitude = parseOptionalNumber(req.body.latitude, "latitude");
    const longitude = parseOptionalNumber(req.body.longitude, "longitude");
    const timeZone = typeof req.body.timeZone === "string" ? req.body.timeZone.trim() : undefined;

    assertLatLon(latitude, longitude);

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      throw customError(409, "TENANT_SLUG_EXISTS", "tenant slug already exists");
    }

    const chairman =
      req.body.chairman && typeof req.body.chairman === "object"
        ? {
            name: assertString((req.body.chairman as any).name, "chairman.name"),
            phone: normalizePhone(assertString((req.body.chairman as any).phone, "chairman.phone")),
            temporaryPassword: assertString((req.body.chairman as any).temporaryPassword, "chairman.temporaryPassword"),
          }
        : null;

    const resolvedTz =
      !timeZone && typeof latitude === "number" && typeof longitude === "number"
        ? await resolveTimeZoneAuto(latitude, longitude)
        : null;

    const passwordHash = chairman ? await hashPassword(chairman.temporaryPassword) : null;

    const created = await prisma.tenant.create({
      data: {
        name,
        slug,
        location,
        address,
        latitude,
        longitude,
        timeZone: timeZone ?? resolvedTz ?? undefined,
        chatRooms: {
          create: CORE_CHAT_ROOMS.map((room) => ({ ...room })),
        },
        ...(chairman
          ? {
              users: {
                create: {
                  name: chairman.name,
                  phone: chairman.phone,
                  role: UserRole.CHAIRMAN,
                  isActive: true,
                  passwordHash: passwordHash!,
                  mustChangePassword: true,
                  passwordUpdatedAt: new Date(),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        location: true,
        address: true,
        latitude: true,
        longitude: true,
        timeZone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit({
      tenantId: created.id,
      actorId: req.user!.userId,
      action: "TENANT_CREATED",
      entityType: "Tenant",
      entityId: String(created.id),
      requestId: req.requestId,
    });

    res.status(201).json({ tenant: created });
  })
);

router.patch(
  "/tenants/:tenantId",
  asyncHandler(async (req, res) => {
    const tenantId = parseId(req.params.tenantId, "tenantId");

    const current = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        location: true,
        address: true,
        latitude: true,
        longitude: true,
        timeZone: true,
      },
    });
    if (!current) throw customError(404, "TENANT_NOT_FOUND", "Tenant not found");

    const nextName = typeof req.body.name === "string" ? assertString(req.body.name, "name") : undefined;
    const nextSlug = typeof req.body.slug === "string" ? assertString(req.body.slug, "slug").toLowerCase() : undefined;
    const nextStatus = parseOptionalEnum(req.body.status, ["ACTIVE", "ARCHIVED"] as const, "status");
    const nextLocation = typeof req.body.location === "string" ? req.body.location.trim() : undefined;
    const nextAddress = typeof req.body.address === "string" ? req.body.address.trim() : undefined;
    const nextLat = parseOptionalNumber(req.body.latitude, "latitude");
    const nextLon = parseOptionalNumber(req.body.longitude, "longitude");
    const nextTz = typeof req.body.timeZone === "string" ? req.body.timeZone.trim() : undefined;

    assertLatLon(nextLat, nextLon);

    if (nextSlug && nextSlug !== current.slug) {
      const slugTaken = await prisma.tenant.findUnique({ where: { slug: nextSlug } });
      if (slugTaken && slugTaken.id !== current.id) {
        throw customError(409, "TENANT_SLUG_EXISTS", "tenant slug already exists");
      }
    }

    const coordsProvided = typeof nextLat === "number" && typeof nextLon === "number";
    const coordsChanged = coordsProvided && (nextLat !== current.latitude || nextLon !== current.longitude);
    const shouldResolveTz = nextTz === undefined && coordsProvided && (coordsChanged || !current.timeZone);
    const resolvedTz = shouldResolveTz ? await resolveTimeZoneAuto(nextLat!, nextLon!) : null;

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: nextName,
        slug: nextSlug,
        status: nextStatus ? (nextStatus as TenantStatus) : undefined,
        location: nextLocation !== undefined ? (nextLocation.length === 0 ? null : nextLocation) : undefined,
        address: nextAddress !== undefined ? (nextAddress.length === 0 ? null : nextAddress) : undefined,
        latitude: nextLat,
        longitude: nextLon,
        timeZone:
          nextTz !== undefined
            ? nextTz.length === 0
              ? null
              : nextTz
            : shouldResolveTz
            ? resolvedTz ?? undefined
            : undefined,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        location: true,
        address: true,
        latitude: true,
        longitude: true,
        timeZone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit({
      tenantId: updated.id,
      actorId: req.user!.userId,
      action: "TENANT_UPDATED",
      entityType: "Tenant",
      entityId: String(updated.id),
      requestId: req.requestId,
      metadata: {
        before: current,
        after: updated,
      },
    });

    res.json({ tenant: updated });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { limit, offset } = getPagination(req);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const tenantId = typeof req.query.tenantId === "string" ? Number(req.query.tenantId) : undefined;
    const role = parseOptionalEnum(req.query.role, ["USER", "CHAIRMAN", "ADMIN"] as const, "role");
    const isActive = parseOptionalBoolean(req.query.isActive, "isActive");

    if (tenantId !== undefined && !Number.isFinite(tenantId)) {
      throw badRequest("tenantId must be a number");
    }

    const where: Prisma.UserWhereInput = {
      ...(typeof tenantId === "number" ? { tenantId } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
      ...(role ? { role: role as UserRole } : {}),
      ...(search.length > 0
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { tenant: { name: { contains: search, mode: "insensitive" } } },
              { tenant: { slug: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ tenantId: "asc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          tenantId: true,
          tenant: {
            select: { id: true, slug: true, name: true },
          },
          name: true,
          phone: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          mustChangePassword: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      items,
      pagination: { total, limit, offset },
    });
  })
);

router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const tenantId = Number(req.body.tenantId);
    if (!Number.isFinite(tenantId)) {
      throw badRequest("tenantId must be a number");
    }
    const name = assertString(req.body.name, "name");
    const phone = normalizePhone(assertString(req.body.phone, "phone"));
    const role = parseOptionalEnum(req.body.role, ["USER", "CHAIRMAN", "ADMIN"] as const, "role") ?? "USER";
    const temporaryPassword = assertString(req.body.temporaryPassword, "temporaryPassword");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      throw customError(404, "TENANT_NOT_FOUND", "Tenant not found");
    }

    const phoneTaken = await prisma.user.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone,
        },
      },
      select: { id: true },
    });
    if (phoneTaken) {
      throw customError(409, "PHONE_ALREADY_EXISTS", "Phone is already used by another user");
    }

    const passwordHash = await hashPassword(temporaryPassword);

    const created = await prisma.user.create({
      data: {
        tenantId,
        name,
        phone,
        role: role as UserRole,
        isActive: true,
        passwordHash,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    await logAudit({
      tenantId,
      actorId: req.user!.userId,
      action: "USER_CREATED",
      entityType: "User",
      entityId: String(created.id),
      requestId: req.requestId,
    });

    res.status(201).json({ user: created });
  })
);

router.patch(
  "/users/:userId",
  asyncHandler(async (req, res) => {
    const userId = parseId(req.params.userId, "userId");
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!current) throw customError(404, "USER_NOT_FOUND", "User not found");

    const nextName = typeof req.body.name === "string" ? assertString(req.body.name, "name") : undefined;
    const nextPhone = typeof req.body.phone === "string" ? normalizePhone(assertString(req.body.phone, "phone")) : undefined;
    const nextActive = parseOptionalBoolean(req.body.isActive, "isActive");
    const nextRole = parseOptionalEnum(req.body.role, ["USER", "CHAIRMAN", "ADMIN"] as const, "role");

    if (nextName === undefined && nextPhone === undefined && nextActive === undefined && nextRole === undefined) {
      throw badRequest("At least one field (name, phone, isActive, role) must be provided");
    }

    if (nextPhone && nextPhone !== current.phone) {
      const phoneTaken = await prisma.user.findUnique({
        where: {
          tenantId_phone: {
            tenantId: current.tenantId,
            phone: nextPhone,
          },
        },
        select: { id: true },
      });
      if (phoneTaken && phoneTaken.id !== current.id) {
        throw customError(409, "PHONE_ALREADY_EXISTS", "Phone is already used by another user");
      }
    }

    const willDeactivateChairman = current.role === UserRole.CHAIRMAN && nextActive === false;
    const willDemoteChairman = current.role === UserRole.CHAIRMAN && nextRole && nextRole !== "CHAIRMAN";
    const mustProtectChairman = willDeactivateChairman || willDemoteChairman;

    if (mustProtectChairman) {
      const activeChairmanCount = await prisma.user.count({
        where: {
          tenantId: current.tenantId,
          role: UserRole.CHAIRMAN,
          isActive: true,
        },
      });
      if (activeChairmanCount <= 1) {
        throw customError(400, "CANNOT_DEACTIVATE_LAST_CHAIRMAN", "Cannot deactivate last active chairman");
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: nextName,
        phone: nextPhone,
        isActive: nextActive,
        role: nextRole ? (nextRole as UserRole) : undefined,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    if (current.isActive && updated.isActive === false) {
      await revokeAllUserSessions(current.tenantId, userId);
    }

    const action =
      current.isActive && updated.isActive === false
        ? "USER_DEACTIVATED"
        : current.isActive === false && updated.isActive
        ? "USER_ACTIVATED"
        : nextRole && nextRole !== current.role
        ? "USER_ROLE_CHANGED"
        : "USER_UPDATED";

    await logAudit({
      tenantId: current.tenantId,
      actorId: req.user!.userId,
      action,
      entityType: "User",
      entityId: String(userId),
      requestId: req.requestId,
      metadata: {
        before: current,
        after: updated,
      },
    });

    res.json({ user: updated });
  })
);

router.post(
  "/users/:userId/reset-password",
  asyncHandler(async (req, res) => {
    const userId = parseId(req.params.userId, "userId");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });
    if (!user) throw customError(404, "USER_NOT_FOUND", "User not found");

    const temporaryPassword = assertString(req.body.temporaryPassword, "temporaryPassword");
    const passwordHash = await hashPassword(temporaryPassword);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    await revokeAllUserSessions(user.tenantId, userId);

    await logAudit({
      tenantId: user.tenantId,
      actorId: req.user!.userId,
      action: "USER_PASSWORD_RESET",
      entityType: "User",
      entityId: String(userId),
      requestId: req.requestId,
    });

    res.json({ user: updated });
  })
);

export default router;
