import dotenv from "dotenv";

dotenv.config();

const getEnv = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const toNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
};

type TuyaRegion = "EU" | "US" | "CN" | "IN";

const normalizeTuyaRegion = (value: string | undefined): TuyaRegion => {
  const normalized = (value ?? "EU").trim().toUpperCase();
  if (normalized === "EU" || normalized === "US" || normalized === "CN" || normalized === "IN") {
    return normalized;
  }
  return "EU";
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const tuyaRegion = normalizeTuyaRegion(process.env.TUYA_REGION);
const smartHomeEnabled = toBoolean(process.env.SMART_HOME_ENABLED, false);

const defaultTuyaApiBaseUrlByRegion: Record<TuyaRegion, string> = {
  EU: "https://openapi.tuyaeu.com",
  US: "https://openapi.tuyaus.com",
  CN: "https://openapi.tuyacn.com",
  IN: "https://openapi.tuyain.com",
};

const defaultTuyaAuthorizeUrlByRegion: Record<TuyaRegion, string> = {
  EU: "https://auth.tuyaeu.com/oauth/authorize",
  US: "https://auth.tuyaus.com/oauth/authorize",
  CN: "https://auth.tuyacn.com/oauth/authorize",
  IN: "https://auth.tuyain.com/oauth/authorize",
};

const tuyaApiBaseUrl = stripTrailingSlash(
  process.env.TUYA_API_BASE_URL ?? defaultTuyaApiBaseUrlByRegion[tuyaRegion]
);
const tuyaOauthAuthorizeUrl = stripTrailingSlash(
  process.env.TUYA_OAUTH_AUTHORIZE_URL ?? defaultTuyaAuthorizeUrlByRegion[tuyaRegion]
);
const tuyaOauthTokenUrl = stripTrailingSlash(
  process.env.TUYA_OAUTH_TOKEN_URL ?? `${tuyaApiBaseUrl}/v1.0/oauth/token`
);
const smartPollIntervalSec = Math.max(10, toNumber(process.env.SMART_POLL_INTERVAL_SEC ?? "30", 30));
const smartStateTtlSeconds = Math.max(120, toNumber(process.env.SMART_STATE_TTL_SECONDS ?? "300", 300));
const pushNotificationsEnabled = toBoolean(process.env.PUSH_NOTIFICATIONS_ENABLED, false);
const fcmServiceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON ?? "";

const tuyaClientId = process.env.TUYA_CLIENT_ID ?? "";
const tuyaClientSecret = process.env.TUYA_CLIENT_SECRET ?? "";
const tuyaWebhookSecret = process.env.TUYA_WEBHOOK_SECRET ?? "";
const tuyaOauthRedirectUrl = process.env.TUYA_OAUTH_REDIRECT_URL ?? "";
const smartHomeTokenEncKey = process.env.SMART_HOME_TOKEN_ENC_KEY ?? "";
const smartHomeStateSecret = process.env.SMART_HOME_STATE_SECRET ?? process.env.JWT_ACCESS_SECRET ?? "";
const smartHomeUiReturnUrl = process.env.SMART_HOME_UI_RETURN_URL ?? "";

if (smartHomeEnabled) {
  if (!tuyaClientId.trim()) {
    throw new Error("Missing required env var when SMART_HOME_ENABLED=true: TUYA_CLIENT_ID");
  }
  if (!tuyaClientSecret.trim()) {
    throw new Error("Missing required env var when SMART_HOME_ENABLED=true: TUYA_CLIENT_SECRET");
  }
  if (!tuyaWebhookSecret.trim()) {
    throw new Error("Missing required env var when SMART_HOME_ENABLED=true: TUYA_WEBHOOK_SECRET");
  }
  if (!tuyaOauthRedirectUrl.trim()) {
    throw new Error("Missing required env var when SMART_HOME_ENABLED=true: TUYA_OAUTH_REDIRECT_URL");
  }
  if (!smartHomeTokenEncKey.trim()) {
    throw new Error("Missing required env var when SMART_HOME_ENABLED=true: SMART_HOME_TOKEN_ENC_KEY");
  }
  if (!smartHomeStateSecret.trim()) {
    throw new Error("Missing required env var when SMART_HOME_ENABLED=true: SMART_HOME_STATE_SECRET");
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toNumber(process.env.PORT ?? "3000", 3000),
  databaseUrl: getEnv("DATABASE_URL", "postgresql://snt_user:snt_password@localhost:5432/snt_db?schema=public"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
  mediaUploadDir: process.env.MEDIA_UPLOAD_DIR ?? "/app/uploads",
  defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG ?? "rassvet",
  platformAdminPhone: process.env.PLATFORM_ADMIN_PHONE,
  platformAdminPassword: process.env.PLATFORM_ADMIN_PASSWORD,
  platformAdminName: process.env.PLATFORM_ADMIN_NAME ?? "Администратор",
  authEnableOtp: toBoolean(process.env.AUTH_ENABLE_OTP, false),
  authEnableSntRegistration: toBoolean(process.env.AUTH_ENABLE_SNT_REGISTRATION, false),
  jwtAccessSecret: getEnv("JWT_ACCESS_SECRET", process.env.JWT_SECRET ?? "dev-access-secret"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET", process.env.JWT_SECRET ?? "dev-refresh-secret"),
  accessTokenTtlMinutes: toNumber(process.env.ACCESS_TOKEN_TTL_MINUTES ?? "30", 30),
  refreshTokenTtlDays: toNumber(process.env.REFRESH_TOKEN_TTL_DAYS ?? "30", 30),
  otpTtlMinutes: toNumber(process.env.OTP_TTL_MINUTES ?? "5", 5),
  otpMaxAttempts: toNumber(process.env.OTP_MAX_ATTEMPTS ?? "5", 5),
  tbankTerminalKey: process.env.TBANK_TERMINAL_KEY ?? "test-terminal",
  tbankWebhookSecret: process.env.TBANK_WEBHOOK_SECRET ?? "test-webhook-secret",
  smartHomeEnabled,
  smartPollIntervalSec,
  smartStateTtlSeconds,
  tuyaRegion,
  tuyaApiBaseUrl,
  tuyaOauthAuthorizeUrl,
  tuyaOauthTokenUrl,
  tuyaClientId,
  tuyaClientSecret,
  tuyaWebhookSecret,
  tuyaOauthRedirectUrl,
  smartHomeTokenEncKey,
  smartHomeStateSecret,
  smartHomeUiReturnUrl,
  pushNotificationsEnabled,
  fcmServiceAccountJson,
};

export const isProd = env.nodeEnv === "production";
