import crypto from "crypto";
import {
  Prisma,
  NotificationType,
  SmartCommandStatus,
  SmartProvider,
  SmartProviderAccountStatus,
  SmartStateSource,
} from "@prisma/client";
import type { Request } from "express";
import { env, isProd } from "../../config/env";
import { prisma } from "../../db";
import { logAudit } from "../../lib/audit";
import { badRequest, notFound, unauthorized } from "../../lib/errors";
import { randomToken } from "../../lib/security";
import { decryptToken, encryptToken } from "./token-crypto";
import { TuyaApiError, TuyaClient, type TuyaCommandInput } from "./tuya-client";

interface OAuthStatePayload {
  tenantId: number;
  userId: number;
  nonce: string;
  exp: number;
}

interface DeviceListItem {
  id: string;
  name: string;
  category: string | null;
  isOnline: boolean;
  roomName: string | null;
  lastSeenAt: string | null;
  updatedAt: string;
  latestState: Record<string, unknown>;
}

interface WebhookProcessResult {
  duplicate: boolean;
  processed: boolean;
}

let pollerHandle: NodeJS.Timeout | null = null;
let pollerRunning = false;

const toInputJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const tuyaClient = new TuyaClient({
  apiBaseUrl: env.tuyaApiBaseUrl,
  oauthAuthorizeUrl: env.tuyaOauthAuthorizeUrl,
  oauthTokenUrl: env.tuyaOauthTokenUrl,
  clientId: env.tuyaClientId,
  clientSecret: env.tuyaClientSecret,
});

const now = () => new Date();

const hashPayload = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const createHmac = (value: string): string =>
  crypto.createHmac("sha256", env.smartHomeStateSecret).update(value).digest("base64url");

const timingSafeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const ensureEnabled = () => {
  if (!env.smartHomeEnabled) {
    throw badRequest("Smart Home integration is disabled");
  }
};

const parseKnownState = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const obj = payload as Record<string, unknown>;

  if (Array.isArray(obj.status)) {
    const state: Record<string, unknown> = {};
    for (const row of obj.status) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const code = typeof item.code === "string" ? item.code : typeof item.id === "string" ? item.id : undefined;
      if (!code) continue;
      state[code] = item.value;
    }
    return state;
  }

  if (obj.dps && typeof obj.dps === "object" && !Array.isArray(obj.dps)) {
    return obj.dps as Record<string, unknown>;
  }

  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const nested = obj.data as Record<string, unknown>;
    if (Array.isArray(nested.status)) {
      return parseKnownState({ status: nested.status });
    }
    if (nested.dps && typeof nested.dps === "object" && !Array.isArray(nested.dps)) {
      return nested.dps as Record<string, unknown>;
    }
  }

  return {};
};

const parseOnlineFlag = (payload: unknown): boolean | undefined => {
  if (!payload || typeof payload !== "object") return undefined;

  const obj = payload as Record<string, unknown>;
  const candidates = [obj.online, obj.isOnline, obj.is_online];

  for (const value of candidates) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
  }

  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const nested = obj.data as Record<string, unknown>;
    const nestedValue = parseOnlineFlag(nested);
    if (typeof nestedValue === "boolean") return nestedValue;
  }

  return undefined;
};

const extractDeviceExternalId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;
  const candidates = [obj.deviceId, obj.devId, obj.device_id, obj.id];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return extractDeviceExternalId(obj.data);
  }

  return null;
};

const extractWebhookEventId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const candidates = [obj.eventId, obj.event_id, obj.messageId, obj.msgId, obj.id];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
};

const resolveSwitchCode = (capabilitySnapshotJson: unknown): string => {
  if (!capabilitySnapshotJson || typeof capabilitySnapshotJson !== "object") {
    return "switch_1";
  }

  const root = capabilitySnapshotJson as Record<string, unknown>;
  const scans: unknown[] = [];

  if (Array.isArray(root.functions)) scans.push(root.functions);
  if (root.raw && typeof root.raw === "object") {
    const raw = root.raw as Record<string, unknown>;
    if (Array.isArray(raw.functions)) scans.push(raw.functions);
    if (Array.isArray(raw.status)) scans.push(raw.status);
  }

  for (const candidate of scans) {
    if (!Array.isArray(candidate)) continue;
    for (const row of candidate) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const code = typeof item.code === "string" ? item.code : undefined;
      if (!code) continue;
      if (code === "switch" || code === "switch_1" || code.startsWith("switch")) {
        return code;
      }
    }
  }

  return "switch_1";
};

const readSwitchState = (stateJson: unknown): boolean | null => {
  if (!stateJson || typeof stateJson !== "object") return null;
  const state = stateJson as Record<string, unknown>;
  const candidates = ["switch", "switch_1", "switch_led"];

  for (const key of candidates) {
    const value = state[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
  }

  return null;
};

const shouldCreateThrottledNotification = async (params: {
  tenantId: number;
  userId: number;
  title: string;
  body: string;
  minutes: number;
}): Promise<boolean> => {
  const since = new Date(Date.now() - params.minutes * 60_000);

  const existing = await prisma.inAppNotification.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      type: NotificationType.DEVICE,
      title: params.title,
      body: params.body,
      createdAt: {
        gt: since,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
    },
  });

  return !existing;
};

const createDeviceNotification = async (params: {
  tenantId: number;
  userId: number;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Promise<void> => {
  if (!(await shouldCreateThrottledNotification({ ...params, minutes: 10 }))) {
    return;
  }

  await prisma.inAppNotification.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      type: NotificationType.DEVICE,
      title: params.title,
      body: params.body,
      payload: params.payload ? toInputJson(params.payload) : undefined,
    },
  });
};

const getOAuthStateToken = (payload: OAuthStatePayload): string => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac(encoded);
  return `${encoded}.${signature}`;
};

const parseOAuthStateToken = (stateToken: string): OAuthStatePayload => {
  const [encoded, signature] = stateToken.split(".");
  if (!encoded || !signature) {
    throw badRequest("Invalid OAuth state");
  }

  const expectedSignature = createHmac(encoded);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw unauthorized("Invalid OAuth state signature");
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (_error) {
    throw badRequest("Invalid OAuth state payload");
  }

  if (!payloadRaw || typeof payloadRaw !== "object") {
    throw badRequest("Invalid OAuth state payload");
  }

  const payload = payloadRaw as Record<string, unknown>;
  const tenantId = Number(payload.tenantId);
  const userId = Number(payload.userId);
  const exp = Number(payload.exp);
  const nonce = typeof payload.nonce === "string" ? payload.nonce : "";

  if (!Number.isFinite(tenantId) || !Number.isFinite(userId) || !Number.isFinite(exp) || nonce.length === 0) {
    throw badRequest("Invalid OAuth state payload");
  }

  if (Date.now() > exp) {
    throw unauthorized("OAuth state expired");
  }

  return {
    tenantId: Math.round(tenantId),
    userId: Math.round(userId),
    exp,
    nonce,
  };
};

const getFallbackUiDevicesUrl = (req: Request): string => {
  const explicit = env.smartHomeUiReturnUrl.trim();
  if (explicit.length > 0) {
    return explicit;
  }

  const host = req.get("host") ?? "";
  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto && forwardedProto.length > 0 ? forwardedProto : "https";

  if (!host) {
    return "http://localhost:3001/devices";
  }

  if (host.startsWith("api.")) {
    return `${protocol}://app.${host.slice(4)}/devices`;
  }

  return `${protocol}://${host}/devices`;
};

const computeAccessExpiresAt = (expiresInSec: number): Date => {
  const safeSeconds = Number.isFinite(expiresInSec) ? Math.max(60, Math.round(expiresInSec)) : 3600;
  return new Date(Date.now() + safeSeconds * 1000);
};

const ensureFreshAccessToken = async (providerAccountId: string): Promise<{
  accountId: string;
  tenantId: number;
  userId: number;
  externalUserId: string;
  accessToken: string;
}> => {
  const account = await prisma.smartProviderAccount.findUnique({
    where: { id: providerAccountId },
  });

  if (!account) {
    throw notFound("Smart Home account not found");
  }

  const accessToken = decryptToken(account.accessTokenEnc, env.smartHomeTokenEncKey);

  if (account.accessExpiresAt.getTime() - Date.now() > 60_000) {
    return {
      accountId: account.id,
      tenantId: account.tenantId,
      userId: account.userId,
      externalUserId: account.externalUserId,
      accessToken,
    };
  }

  const refreshToken = decryptToken(account.refreshTokenEnc, env.smartHomeTokenEncKey);

  try {
    const refreshed = await tuyaClient.refreshToken(refreshToken);
    const updated = await prisma.smartProviderAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encryptToken(refreshed.accessToken, env.smartHomeTokenEncKey),
        refreshTokenEnc: encryptToken(refreshed.refreshToken, env.smartHomeTokenEncKey),
        accessExpiresAt: computeAccessExpiresAt(refreshed.expiresInSec),
        externalUserId: refreshed.externalUserId,
        status: SmartProviderAccountStatus.ACTIVE,
      },
    });

    return {
      accountId: updated.id,
      tenantId: updated.tenantId,
      userId: updated.userId,
      externalUserId: updated.externalUserId,
      accessToken: refreshed.accessToken,
    };
  } catch (_error) {
    await prisma.smartProviderAccount.update({
      where: { id: account.id },
      data: {
        status: SmartProviderAccountStatus.NEED_RECONNECT,
      },
    });
    throw unauthorized("Tuya token expired. Reconnect integration.");
  }
};

export const createTuyaOAuthStartUrl = (params: {
  tenantId: number;
  userId: number;
}): string => {
  ensureEnabled();

  const payload: OAuthStatePayload = {
    tenantId: params.tenantId,
    userId: params.userId,
    nonce: randomToken(8),
    exp: Date.now() + 10 * 60_000,
  };

  return tuyaClient.buildAuthorizeUrl({
    state: getOAuthStateToken(payload),
    redirectUri: env.tuyaOauthRedirectUrl,
  });
};

export const completeTuyaOAuthCallback = async (params: {
  code: string;
  state: string;
  requestId?: string;
}): Promise<{ tenantId: number; userId: number }> => {
  ensureEnabled();

  const parsedState = parseOAuthStateToken(params.state);
  const oauthTokens = await tuyaClient.exchangeAuthorizationCode({
    code: params.code,
    redirectUri: env.tuyaOauthRedirectUrl,
  });

  const account = await prisma.smartProviderAccount.upsert({
    where: {
      provider_tenantId_userId: {
        provider: SmartProvider.TUYA,
        tenantId: parsedState.tenantId,
        userId: parsedState.userId,
      },
    },
    create: {
      tenantId: parsedState.tenantId,
      userId: parsedState.userId,
      provider: SmartProvider.TUYA,
      externalUserId: oauthTokens.externalUserId,
      accessTokenEnc: encryptToken(oauthTokens.accessToken, env.smartHomeTokenEncKey),
      refreshTokenEnc: encryptToken(oauthTokens.refreshToken, env.smartHomeTokenEncKey),
      accessExpiresAt: computeAccessExpiresAt(oauthTokens.expiresInSec),
      status: SmartProviderAccountStatus.ACTIVE,
    },
    update: {
      externalUserId: oauthTokens.externalUserId,
      accessTokenEnc: encryptToken(oauthTokens.accessToken, env.smartHomeTokenEncKey),
      refreshTokenEnc: encryptToken(oauthTokens.refreshToken, env.smartHomeTokenEncKey),
      accessExpiresAt: computeAccessExpiresAt(oauthTokens.expiresInSec),
      status: SmartProviderAccountStatus.ACTIVE,
    },
  });

  await syncDevicesForAccount(account.id, SmartStateSource.POLL);

  await logAudit({
    tenantId: parsedState.tenantId,
    actorId: parsedState.userId,
    action: "SMART_LINKED",
    entityType: "SmartProviderAccount",
    entityId: account.id,
    requestId: params.requestId,
    metadata: {
      provider: SmartProvider.TUYA,
      externalUserId: oauthTokens.externalUserId,
    },
  });

  return {
    tenantId: parsedState.tenantId,
    userId: parsedState.userId,
  };
};

export const buildOAuthCallbackRedirect = (req: Request, status: "connected" | "error", message?: string): string => {
  const url = new URL(getFallbackUiDevicesUrl(req));
  url.searchParams.set("tuya", status);
  if (message && message.trim().length > 0) {
    url.searchParams.set("message", message.trim());
  }
  return url.toString();
};

export const getIntegrationStatus = async (tenantId: number, userId: number) => {
  ensureEnabled();

  const account = await prisma.smartProviderAccount.findFirst({
    where: {
      tenantId,
      userId,
      provider: SmartProvider.TUYA,
    },
    select: {
      id: true,
      status: true,
      lastSyncAt: true,
      updatedAt: true,
      _count: {
        select: {
          devices: true,
        },
      },
    },
  });

  if (!account) {
    return {
      connected: false,
      provider: SmartProvider.TUYA,
      needsReconnect: false,
      devicesCount: 0,
    };
  }

  return {
    connected: account.status === SmartProviderAccountStatus.ACTIVE,
    provider: SmartProvider.TUYA,
    needsReconnect: account.status === SmartProviderAccountStatus.NEED_RECONNECT,
    devicesCount: account._count.devices,
    lastSyncAt: account.lastSyncAt,
    updatedAt: account.updatedAt,
  };
};

export const listDevicesForUser = async (tenantId: number, userId: number): Promise<DeviceListItem[]> => {
  ensureEnabled();

  const account = await prisma.smartProviderAccount.findFirst({
    where: {
      tenantId,
      userId,
      provider: SmartProvider.TUYA,
      status: SmartProviderAccountStatus.ACTIVE,
    },
    select: {
      id: true,
      lastSyncAt: true,
    },
  });

  if (account && (!account.lastSyncAt || Date.now() - account.lastSyncAt.getTime() > env.smartStateTtlSeconds * 1000)) {
    await syncDevicesForAccount(account.id, SmartStateSource.POLL).catch(() => {
      // Keep list endpoint resilient; stale state is better than hard failure.
    });
  }

  const devices = await prisma.smartDevice.findMany({
    where: {
      tenantId,
      userId,
      provider: SmartProvider.TUYA,
    },
    include: {
      states: {
        orderBy: {
          reportedAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return devices.map((device) => ({
    id: device.id,
    name: device.name,
    category: device.category,
    isOnline: device.isOnline,
    roomName: device.roomName,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    updatedAt: device.updatedAt.toISOString(),
    latestState: (device.states[0]?.stateJson as Record<string, unknown> | undefined) ?? {},
  }));
};

export const getDeviceStateForUser = async (params: {
  tenantId: number;
  userId: number;
  deviceId: string;
}) => {
  ensureEnabled();

  const device = await prisma.smartDevice.findFirst({
    where: {
      id: params.deviceId,
      tenantId: params.tenantId,
      userId: params.userId,
      provider: SmartProvider.TUYA,
    },
    include: {
      states: {
        orderBy: {
          reportedAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!device) {
    throw notFound("Device not found");
  }

  return {
    deviceId: device.id,
    latestState: (device.states[0]?.stateJson as Record<string, unknown> | undefined) ?? {},
    reportedAt: device.states[0]?.reportedAt?.toISOString() ?? null,
    isOnline: device.isOnline,
  };
};

export const listDeviceCommandHistory = async (params: {
  tenantId: number;
  userId: number;
  deviceId: string;
  limit: number;
}) => {
  ensureEnabled();

  const device = await prisma.smartDevice.findFirst({
    where: {
      id: params.deviceId,
      tenantId: params.tenantId,
      userId: params.userId,
      provider: SmartProvider.TUYA,
    },
    select: {
      id: true,
    },
  });

  if (!device) {
    throw notFound("Device not found");
  }

  const take = Math.max(1, Math.min(100, Math.round(params.limit)));

  const items = await prisma.smartDeviceCommand.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      deviceId: params.deviceId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take,
  });

  return {
    items,
  };
};

const mapCommandTypeToPayload = (
  commandType: "turn_on" | "turn_off" | "toggle",
  switchCode: string,
  currentState: Record<string, unknown>
): TuyaCommandInput[] => {
  if (commandType === "turn_on") {
    return [{ code: switchCode, value: true }];
  }

  if (commandType === "turn_off") {
    return [{ code: switchCode, value: false }];
  }

  const current = readSwitchState(currentState);
  const next = typeof current === "boolean" ? !current : true;
  return [{ code: switchCode, value: next }];
};

export const sendDeviceCommand = async (params: {
  tenantId: number;
  userId: number;
  deviceId: string;
  commandType: string;
  requestId?: string;
}) => {
  ensureEnabled();

  const normalizedCommandType = params.commandType.trim().toLowerCase();
  if (!["turn_on", "turn_off", "toggle"].includes(normalizedCommandType)) {
    throw badRequest("Unsupported commandType. Use turn_on | turn_off | toggle");
  }

  const device = await prisma.smartDevice.findFirst({
    where: {
      id: params.deviceId,
      tenantId: params.tenantId,
      userId: params.userId,
      provider: SmartProvider.TUYA,
    },
    include: {
      providerAccount: true,
      states: {
        orderBy: {
          reportedAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!device) {
    throw notFound("Device not found");
  }

  if (device.providerAccount.status !== SmartProviderAccountStatus.ACTIVE) {
    throw badRequest("Tuya account requires reconnection");
  }

  const latestState = (device.states[0]?.stateJson as Record<string, unknown> | undefined) ?? {};
  const switchCode = resolveSwitchCode(device.capabilitySnapshotJson);

  const command = await prisma.smartDeviceCommand.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      deviceId: device.id,
      commandType: normalizedCommandType,
      payloadJson: {
        switchCode,
      },
      status: SmartCommandStatus.QUEUED,
    },
  });

  try {
    const tokenPayload = await ensureFreshAccessToken(device.providerAccountId);

    const tuyaCommands = mapCommandTypeToPayload(
      normalizedCommandType as "turn_on" | "turn_off" | "toggle",
      switchCode,
      latestState
    );

    await prisma.smartDeviceCommand.update({
      where: { id: command.id },
      data: {
        status: SmartCommandStatus.SENT,
      },
    });

    const providerResult = await tuyaClient.sendDeviceCommands(
      tokenPayload.accessToken,
      device.externalDeviceId,
      tuyaCommands
    );

    const statusSnapshot = await tuyaClient
      .getDeviceStatus(tokenPayload.accessToken, device.externalDeviceId)
      .catch(() => null);

    if (statusSnapshot) {
      await prisma.smartDevice.update({
        where: { id: device.id },
        data: {
          isOnline: statusSnapshot.isOnline,
          lastSeenAt: now(),
        },
      });

      await prisma.smartDeviceState.create({
        data: {
          deviceId: device.id,
          source: SmartStateSource.POLL,
          stateJson: toInputJson(statusSnapshot.state),
          reportedAt: now(),
        },
      });
    }

    const updated = await prisma.smartDeviceCommand.update({
      where: { id: command.id },
      data: {
        status: SmartCommandStatus.SUCCESS,
        providerRequestId: providerResult.providerRequestId,
        executedAt: now(),
      },
    });

    await logAudit({
      tenantId: params.tenantId,
      actorId: params.userId,
      action: "SMART_COMMAND_SENT",
      entityType: "SmartDeviceCommand",
      entityId: updated.id,
      requestId: params.requestId,
      metadata: {
        deviceId: device.id,
        commandType: normalizedCommandType,
      },
    });

    return {
      command: updated,
      latestState: statusSnapshot?.state ?? latestState,
    };
  } catch (error) {
    const errorCode = error instanceof TuyaApiError ? `HTTP_${error.status ?? "ERROR"}` : "UNKNOWN";
    const errorMessage =
      error instanceof Error ? error.message.slice(0, 512) : "Failed to send command";

    await prisma.smartDeviceCommand.update({
      where: { id: command.id },
      data: {
        status: SmartCommandStatus.FAILED,
        errorCode,
        errorMessage,
        executedAt: now(),
      },
    });

    await createDeviceNotification({
      tenantId: params.tenantId,
      userId: params.userId,
      title: "Команда устройству не выполнена",
      body: `Устройство "${device.name}": ${errorMessage}`,
      payload: {
        deviceId: device.id,
        commandType: normalizedCommandType,
        errorCode,
      },
    });

    await logAudit({
      tenantId: params.tenantId,
      actorId: params.userId,
      action: "SMART_COMMAND_FAILED",
      entityType: "SmartDeviceCommand",
      entityId: command.id,
      requestId: params.requestId,
      metadata: {
        deviceId: device.id,
        commandType: normalizedCommandType,
        errorCode,
      },
    });

    throw badRequest("Failed to send command to device");
  }
};

export const unlinkIntegration = async (params: {
  tenantId: number;
  userId: number;
  requestId?: string;
}) => {
  ensureEnabled();

  const account = await prisma.smartProviderAccount.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      provider: SmartProvider.TUYA,
    },
    select: {
      id: true,
    },
  });

  if (!account) {
    return { ok: true, removed: false };
  }

  await prisma.$transaction(async (tx) => {
    const devices = await tx.smartDevice.findMany({
      where: {
        providerAccountId: account.id,
      },
      select: {
        id: true,
      },
    });

    const deviceIds = devices.map((device) => device.id);

    if (deviceIds.length > 0) {
      await tx.smartDeviceCommand.deleteMany({
        where: {
          deviceId: {
            in: deviceIds,
          },
        },
      });

      await tx.smartDeviceState.deleteMany({
        where: {
          deviceId: {
            in: deviceIds,
          },
        },
      });

      await tx.smartDevice.deleteMany({
        where: {
          id: {
            in: deviceIds,
          },
        },
      });
    }

    await tx.smartProviderAccount.delete({
      where: {
        id: account.id,
      },
    });
  });

  await logAudit({
    tenantId: params.tenantId,
    actorId: params.userId,
    action: "SMART_UNLINKED",
    entityType: "SmartProviderAccount",
    entityId: account.id,
    requestId: params.requestId,
    metadata: {
      provider: SmartProvider.TUYA,
    },
  });

  return { ok: true, removed: true };
};

export const syncDevicesForAccount = async (
  providerAccountId: string,
  source: SmartStateSource
): Promise<{ syncedDevices: number }> => {
  ensureEnabled();

  const tokenPayload = await ensureFreshAccessToken(providerAccountId);
  const devices = await tuyaClient.listUserDevices(tokenPayload.accessToken, tokenPayload.externalUserId);

  const knownExternalIds = new Set<string>();

  for (const externalDevice of devices) {
    knownExternalIds.add(externalDevice.externalDeviceId);

    const dbDevice = await prisma.smartDevice.upsert({
      where: {
        providerAccountId_externalDeviceId: {
          providerAccountId,
          externalDeviceId: externalDevice.externalDeviceId,
        },
      },
      create: {
        tenantId: tokenPayload.tenantId,
        userId: tokenPayload.userId,
        providerAccountId,
        provider: SmartProvider.TUYA,
        externalDeviceId: externalDevice.externalDeviceId,
        name: externalDevice.name,
        category: externalDevice.category,
        isOnline: externalDevice.isOnline,
        roomName: externalDevice.roomName,
        capabilitySnapshotJson: toInputJson(externalDevice.capabilitySnapshot),
        lastSeenAt: externalDevice.isOnline ? now() : null,
      },
      update: {
        name: externalDevice.name,
        category: externalDevice.category,
        isOnline: externalDevice.isOnline,
        roomName: externalDevice.roomName,
        capabilitySnapshotJson: toInputJson(externalDevice.capabilitySnapshot),
        lastSeenAt: externalDevice.isOnline ? now() : null,
      },
    });

    try {
      const status = await tuyaClient.getDeviceStatus(tokenPayload.accessToken, externalDevice.externalDeviceId);

      await prisma.smartDevice.update({
        where: { id: dbDevice.id },
        data: {
          isOnline: status.isOnline,
          lastSeenAt: now(),
        },
      });

      await prisma.smartDeviceState.create({
        data: {
          deviceId: dbDevice.id,
          source,
          stateJson: toInputJson(status.state),
          reportedAt: now(),
        },
      });
    } catch (_error) {
      // Non-fatal: keep last known state if a single device status fetch fails.
    }
  }

  if (knownExternalIds.size > 0) {
    await prisma.smartDevice.updateMany({
      where: {
        providerAccountId,
        externalDeviceId: {
          notIn: Array.from(knownExternalIds),
        },
      },
      data: {
        isOnline: false,
      },
    });
  }

  await prisma.smartProviderAccount.update({
    where: { id: providerAccountId },
    data: {
      status: SmartProviderAccountStatus.ACTIVE,
      lastSyncAt: now(),
    },
  });

  return {
    syncedDevices: devices.length,
  };
};

const verifyWebhookSignature = (payload: unknown, reqHeaders: Request["headers"]): boolean => {
  const signatureRaw = reqHeaders["x-tuya-sign"] ?? reqHeaders["x-tuya-signature"];
  const signature = typeof signatureRaw === "string" ? signatureRaw.trim() : "";

  if (!signature) return false;

  const eventId = extractWebhookEventId(payload) ?? "unknown";
  const timestampRaw = reqHeaders["x-tuya-t"] ?? reqHeaders["x-tuya-timestamp"];
  const timestamp = typeof timestampRaw === "string" ? timestampRaw : "";

  const hmac = crypto
    .createHmac("sha256", env.tuyaWebhookSecret)
    .update(`${eventId}:${timestamp}`)
    .digest("hex");

  return timingSafeEqual(signature, hmac) || timingSafeEqual(signature, env.tuyaWebhookSecret);
};

export const processTuyaWebhook = async (params: {
  payload: unknown;
  headers: Request["headers"];
}): Promise<WebhookProcessResult> => {
  ensureEnabled();

  const signatureValid = verifyWebhookSignature(params.payload, params.headers);
  if (isProd && !signatureValid) {
    throw unauthorized("Invalid Tuya webhook signature");
  }

  const eventId = extractWebhookEventId(params.payload);
  const dedupeKey = eventId ?? hashPayload(JSON.stringify(params.payload));
  const externalDeviceId = extractDeviceExternalId(params.payload);

  const existing = await prisma.smartWebhookEvent.findUnique({
    where: {
      provider_dedupeKey: {
        provider: SmartProvider.TUYA,
        dedupeKey,
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return {
      duplicate: true,
      processed: true,
    };
  }

  const device = externalDeviceId
    ? await prisma.smartDevice.findFirst({
        where: {
          provider: SmartProvider.TUYA,
          externalDeviceId,
        },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          name: true,
          isOnline: true,
        },
      })
    : null;

  const created = await prisma.smartWebhookEvent.create({
    data: {
      provider: SmartProvider.TUYA,
      eventId,
      dedupeKey,
      tenantId: device?.tenantId,
      userId: device?.userId,
      deviceExternalId: externalDeviceId,
      payloadJson: params.payload as any,
      signatureValid,
    },
  });

  if (!device) {
    await prisma.smartWebhookEvent.update({
      where: { id: created.id },
      data: {
        processedAt: now(),
      },
    });

    return {
      duplicate: false,
      processed: true,
    };
  }

  const parsedState = parseKnownState(params.payload);
  const onlineFlag = parseOnlineFlag(params.payload);

  await prisma.smartDevice.update({
    where: { id: device.id },
    data: {
      isOnline: typeof onlineFlag === "boolean" ? onlineFlag : device.isOnline,
      lastSeenAt: now(),
    },
  });

  await prisma.smartDeviceState.create({
    data: {
      deviceId: device.id,
      source: SmartStateSource.WEBHOOK,
      stateJson: toInputJson(parsedState),
      reportedAt: now(),
    },
  });

  if (typeof onlineFlag === "boolean" && onlineFlag !== device.isOnline) {
    if (!onlineFlag) {
      await createDeviceNotification({
        tenantId: device.tenantId,
        userId: device.userId,
        title: "Устройство офлайн",
        body: `Устройство "${device.name}" недоступно`,
        payload: {
          deviceId: device.id,
          externalDeviceId,
        },
      });
    } else {
      await createDeviceNotification({
        tenantId: device.tenantId,
        userId: device.userId,
        title: "Устройство снова в сети",
        body: `Устройство "${device.name}" снова доступно`,
        payload: {
          deviceId: device.id,
          externalDeviceId,
        },
      });
    }
  }

  await prisma.smartWebhookEvent.update({
    where: {
      id: created.id,
    },
    data: {
      processedAt: now(),
    },
  });

  return {
    duplicate: false,
    processed: true,
  };
};

export const runSmartHomePollingCycle = async (): Promise<void> => {
  ensureEnabled();

  const staleBefore = new Date(Date.now() - env.smartStateTtlSeconds * 1000);

  const devices = await prisma.smartDevice.findMany({
    where: {
      provider: SmartProvider.TUYA,
      providerAccount: {
        status: SmartProviderAccountStatus.ACTIVE,
      },
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }],
    },
    include: {
      providerAccount: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: 200,
  });

  if (devices.length === 0) {
    return;
  }

  const tokenCache = new Map<string, Awaited<ReturnType<typeof ensureFreshAccessToken>>>();

  for (const device of devices) {
    try {
      const cached = tokenCache.get(device.providerAccount.id);
      const access = cached ?? (await ensureFreshAccessToken(device.providerAccount.id));
      tokenCache.set(device.providerAccount.id, access);

      const status = await tuyaClient.getDeviceStatus(access.accessToken, device.externalDeviceId);
      await prisma.smartDevice.update({
        where: {
          id: device.id,
        },
        data: {
          isOnline: status.isOnline,
          lastSeenAt: now(),
        },
      });

      await prisma.smartDeviceState.create({
        data: {
          deviceId: device.id,
          source: SmartStateSource.POLL,
          stateJson: toInputJson(status.state),
          reportedAt: now(),
        },
      });
    } catch (_error) {
      // Polling failures are tolerated; webhook and next cycle will retry.
    }
  }
};

export const startSmartHomePoller = (): void => {
  if (!env.smartHomeEnabled) {
    return;
  }

  if (pollerHandle) {
    return;
  }

  pollerHandle = setInterval(async () => {
    if (pollerRunning) {
      return;
    }

    pollerRunning = true;
    try {
      await runSmartHomePollingCycle();
    } catch (_error) {
      // Swallow poller errors to keep backend process healthy.
    } finally {
      pollerRunning = false;
    }
  }, env.smartPollIntervalSec * 1000);
};

export const stopSmartHomePoller = (): void => {
  if (!pollerHandle) {
    return;
  }

  clearInterval(pollerHandle);
  pollerHandle = null;
};
