import { Router } from "express";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";
import { createRateLimit } from "../middlewares/rate-limit";
import {
  buildOAuthCallbackRedirect,
  completeTuyaOAuthCallback,
  createTuyaOAuthStartUrl,
  getDeviceStateForUser,
  getIntegrationStatus,
  listDeviceCommandHistory,
  listDevicesForUser,
  processTuyaWebhook,
  sendDeviceCommand,
  unlinkIntegration,
} from "../services/smart-home/service";

const router = Router();

router.post(
  "/webhook/tuya",
  createRateLimit(60, 60_000),
  asyncHandler(async (req, res) => {
    const result = await processTuyaWebhook({
      payload: req.body,
      headers: req.headers,
    });

    res.json({
      ok: true,
      duplicate: result.duplicate,
      processed: result.processed,
    });
  })
);

router.get(
  "/oauth/callback",
  asyncHandler(async (req, res) => {
    const oauthError = typeof req.query.error === "string" ? req.query.error : "";
    const oauthErrorDescription =
      typeof req.query.error_description === "string" ? req.query.error_description : "";

    if (oauthError) {
      const redirectUrl = buildOAuthCallbackRedirect(req, "error", oauthErrorDescription || oauthError);
      res.redirect(302, redirectUrl);
      return;
    }

    const code = assertString(req.query.code, "code");
    const state = assertString(req.query.state, "state");

    try {
      await completeTuyaOAuthCallback({
        code,
        state,
        requestId: req.requestId,
      });
      const redirectUrl = buildOAuthCallbackRedirect(req, "connected");
      res.redirect(302, redirectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth callback failed";
      const redirectUrl = buildOAuthCallbackRedirect(req, "error", message);
      res.redirect(302, redirectUrl);
    }
  })
);

router.get(
  "/oauth/start",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const url = createTuyaOAuthStartUrl({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
    });

    res.json({ url });
  })
);

router.get(
  "/integration",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const status = await getIntegrationStatus(req.user!.tenantId, req.user!.userId);
    res.json(status);
  })
);

router.delete(
  "/integration",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const result = await unlinkIntegration({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      requestId: req.requestId,
    });

    res.json(result);
  })
);

router.get(
  "/devices",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const items = await listDevicesForUser(req.user!.tenantId, req.user!.userId);
    res.json({ items });
  })
);

router.get(
  "/devices/:deviceId/state",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const state = await getDeviceStateForUser({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      deviceId: req.params.deviceId,
    });

    res.json(state);
  })
);

router.get(
  "/devices/:deviceId/commands",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

    const history = await listDeviceCommandHistory({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      deviceId: req.params.deviceId,
      limit,
    });

    res.json(history);
  })
);

router.post(
  "/devices/:deviceId/commands",
  requireAuth,
  requireRole("USER", "CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const commandType = assertString(req.body.commandType, "commandType");

    const result = await sendDeviceCommand({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      deviceId: req.params.deviceId,
      commandType,
      requestId: req.requestId,
    });

    res.status(201).json(result);
  })
);

export default router;
