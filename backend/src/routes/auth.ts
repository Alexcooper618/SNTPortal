import { Router } from "express";
import { OtpPurpose } from "@prisma/client";
import { asyncHandler } from "../middlewares/async-handler";
import { requireAuth } from "../middlewares/auth";
import { createRateLimit } from "../middlewares/rate-limit";
import { logAudit } from "../lib/audit";
import { getTenantBySlug, resolveTenantSlug } from "../lib/tenant";
import { assertString, normalizePhone } from "../lib/validators";
import { sanitizeUser } from "../lib/user-safe";
import {
  changePassword,
  loginWithPassword,
  registerTenantWithChairman,
  requestOtpCode,
  revokeSessionById,
  revokeSessionByRefreshToken,
  rotateRefreshSession,
  verifyOtpAndCreateSession,
} from "../services/auth-service";

const router = Router();

const otpRateLimit = createRateLimit(8, 60_000);
const passwordRateLimit = createRateLimit(15, 60_000);

router.post(
  "/register-snt",
  asyncHandler(async (req, res) => {
    const tenantName = assertString(req.body.tenantName ?? req.body.sntName, "tenantName");
    const tenantSlug = assertString(req.body.tenantSlug, "tenantSlug").toLowerCase();
    const location = typeof req.body.location === "string" ? req.body.location.trim() : undefined;
    const chairmanName = assertString(req.body.chairmanName, "chairmanName");
    const chairmanPhone = normalizePhone(assertString(req.body.chairmanPhone ?? req.body.phone, "chairmanPhone"));
    const chairmanPassword = assertString(req.body.chairmanPassword, "chairmanPassword");

    const result = await registerTenantWithChairman({
      tenantName,
      tenantSlug,
      location,
      chairmanName,
      chairmanPhone,
      chairmanPassword,
    });

    await logAudit({
      tenantId: result.tenant.id,
      actorId: result.chairman.id,
      action: "TENANT_REGISTERED",
      entityType: "Tenant",
      entityId: String(result.tenant.id),
      requestId: req.requestId,
    });

    res.status(201).json({
      tenant: result.tenant,
      user: sanitizeUser(result.chairman),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      mustChangePassword: result.mustChangePassword,
    });
  })
);

router.post(
  "/request-otp",
  otpRateLimit,
  asyncHandler(async (req, res) => {
    const tenantSlug = resolveTenantSlug(req);
    const tenant = await getTenantBySlug(tenantSlug);
    const phone = normalizePhone(assertString(req.body.phone, "phone"));

    const otp = await requestOtpCode({
      tenantId: tenant.id,
      phone,
      purpose: OtpPurpose.LOGIN,
    });

    res.json({
      ok: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
      },
      ...otp,
    });
  })
);

router.post(
  "/verify-otp",
  otpRateLimit,
  asyncHandler(async (req, res) => {
    const tenantSlug = resolveTenantSlug(req);
    const tenant = await getTenantBySlug(tenantSlug);
    const phone = normalizePhone(assertString(req.body.phone, "phone"));
    const code = assertString(req.body.code, "code");

    const result = await verifyOtpAndCreateSession({
      tenantId: tenant.id,
      phone,
      code,
    });

    await logAudit({
      tenantId: tenant.id,
      actorId: result.user.id,
      action: "AUTH_LOGIN_OTP_SUCCESS",
      entityType: "User",
      entityId: String(result.user.id),
      requestId: req.requestId,
    });

    res.json({
      user: sanitizeUser(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      mustChangePassword: result.mustChangePassword,
      expiresInMinutes: 30,
    });
  })
);

router.post(
  "/login",
  passwordRateLimit,
  asyncHandler(async (req, res) => {
    const tenantSlug = resolveTenantSlug(req);
    const tenant = await getTenantBySlug(tenantSlug);
    const phone = normalizePhone(assertString(req.body.phone, "phone"));
    const password = assertString(req.body.password, "password");

    try {
      const result = await loginWithPassword({
        tenantId: tenant.id,
        phone,
        password,
      });

      await logAudit({
        tenantId: tenant.id,
        actorId: result.user.id,
        action: "AUTH_LOGIN_PASSWORD_SUCCESS",
        entityType: "User",
        entityId: String(result.user.id),
        requestId: req.requestId,
      });

      res.json({
        user: sanitizeUser(result.user),
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        mustChangePassword: result.mustChangePassword,
        expiresInMinutes: 30,
      });
    } catch (error) {
      await logAudit({
        tenantId: tenant.id,
        action: "AUTH_LOGIN_PASSWORD_FAILED",
        entityType: "Auth",
        requestId: req.requestId,
        metadata: {
          phone,
        },
      });

      throw error;
    }
  })
);

router.post(
  "/change-password",
  requireAuth,
  passwordRateLimit,
  asyncHandler(async (req, res) => {
    const currentPassword = assertString(req.body.currentPassword, "currentPassword");
    const newPassword = assertString(req.body.newPassword, "newPassword");

    const user = await changePassword({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      currentPassword,
      newPassword,
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "AUTH_PASSWORD_CHANGED",
      entityType: "User",
      entityId: String(req.user!.userId),
      requestId: req.requestId,
    });

    res.json({
      ok: true,
      user: sanitizeUser(user),
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = assertString(req.body.refreshToken, "refreshToken");
    const result = await rotateRefreshSession(refreshToken);

    res.json({
      user: sanitizeUser(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      mustChangePassword: result.mustChangePassword,
      expiresInMinutes: 30,
    });
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (typeof req.body.refreshToken === "string" && req.body.refreshToken.trim().length > 0) {
      await revokeSessionByRefreshToken(req.body.refreshToken.trim());
    } else if (req.user?.sessionId) {
      await revokeSessionById(req.user.sessionId);
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "AUTH_LOGOUT",
      entityType: "UserSession",
      entityId: req.user?.sessionId,
      requestId: req.requestId,
    });

    res.json({ ok: true });
  })
);

router.get(
  "/session",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      user: req.user,
    });
  })
);

export default router;
