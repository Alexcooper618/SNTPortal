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

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toNumber(process.env.PORT ?? "3000", 3000),
  databaseUrl: getEnv("DATABASE_URL", "postgresql://snt_user:snt_password@localhost:5432/snt_db?schema=public"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
  defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG ?? "rassvet",
  jwtAccessSecret: getEnv("JWT_ACCESS_SECRET", process.env.JWT_SECRET ?? "dev-access-secret"),
  jwtRefreshSecret: getEnv("JWT_REFRESH_SECRET", process.env.JWT_SECRET ?? "dev-refresh-secret"),
  accessTokenTtlMinutes: toNumber(process.env.ACCESS_TOKEN_TTL_MINUTES ?? "30", 30),
  refreshTokenTtlDays: toNumber(process.env.REFRESH_TOKEN_TTL_DAYS ?? "30", 30),
  otpTtlMinutes: toNumber(process.env.OTP_TTL_MINUTES ?? "5", 5),
  otpMaxAttempts: toNumber(process.env.OTP_MAX_ATTEMPTS ?? "5", 5),
  tbankTerminalKey: process.env.TBANK_TERMINAL_KEY ?? "test-terminal",
  tbankWebhookSecret: process.env.TBANK_WEBHOOK_SECRET ?? "test-webhook-secret",
};

export const isProd = env.nodeEnv === "production";
