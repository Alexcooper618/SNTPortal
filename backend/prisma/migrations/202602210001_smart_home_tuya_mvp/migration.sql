ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEVICE';

CREATE TYPE "SmartProvider" AS ENUM ('TUYA');
CREATE TYPE "SmartProviderAccountStatus" AS ENUM ('ACTIVE', 'NEED_RECONNECT', 'DISABLED');
CREATE TYPE "SmartStateSource" AS ENUM ('WEBHOOK', 'POLL');
CREATE TYPE "SmartCommandStatus" AS ENUM ('QUEUED', 'SENT', 'SUCCESS', 'FAILED', 'TIMEOUT');

CREATE TABLE "SmartProviderAccount" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "SmartProvider" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "SmartProviderAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartProviderAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmartDevice" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "provider" "SmartProvider" NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "roomName" TEXT,
    "capabilitySnapshotJson" JSONB,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmartDeviceState" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "source" "SmartStateSource" NOT NULL,
    "stateJson" JSONB NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartDeviceState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmartDeviceCommand" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "providerRequestId" TEXT,
    "status" "SmartCommandStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartDeviceCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmartWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "SmartProvider" NOT NULL,
    "eventId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "tenantId" INTEGER,
    "userId" INTEGER,
    "deviceExternalId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SmartWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmartProviderAccount_provider_tenantId_userId_key" ON "SmartProviderAccount"("provider", "tenantId", "userId");
CREATE INDEX "SmartProviderAccount_tenantId_userId_status_idx" ON "SmartProviderAccount"("tenantId", "userId", "status");
CREATE INDEX "SmartProviderAccount_provider_externalUserId_idx" ON "SmartProviderAccount"("provider", "externalUserId");

CREATE UNIQUE INDEX "SmartDevice_providerAccountId_externalDeviceId_key" ON "SmartDevice"("providerAccountId", "externalDeviceId");
CREATE INDEX "SmartDevice_tenantId_userId_updatedAt_idx" ON "SmartDevice"("tenantId", "userId", "updatedAt");
CREATE INDEX "SmartDevice_provider_externalDeviceId_idx" ON "SmartDevice"("provider", "externalDeviceId");

CREATE INDEX "SmartDeviceState_deviceId_reportedAt_idx" ON "SmartDeviceState"("deviceId", "reportedAt");

CREATE INDEX "SmartDeviceCommand_tenantId_userId_createdAt_idx" ON "SmartDeviceCommand"("tenantId", "userId", "createdAt");
CREATE INDEX "SmartDeviceCommand_deviceId_createdAt_idx" ON "SmartDeviceCommand"("deviceId", "createdAt");

CREATE UNIQUE INDEX "SmartWebhookEvent_provider_dedupeKey_key" ON "SmartWebhookEvent"("provider", "dedupeKey");
CREATE INDEX "SmartWebhookEvent_tenantId_userId_receivedAt_idx" ON "SmartWebhookEvent"("tenantId", "userId", "receivedAt");

ALTER TABLE "SmartProviderAccount" ADD CONSTRAINT "SmartProviderAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmartProviderAccount" ADD CONSTRAINT "SmartProviderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SmartDevice" ADD CONSTRAINT "SmartDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmartDevice" ADD CONSTRAINT "SmartDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmartDevice" ADD CONSTRAINT "SmartDevice_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "SmartProviderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmartDeviceState" ADD CONSTRAINT "SmartDeviceState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SmartDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmartDeviceCommand" ADD CONSTRAINT "SmartDeviceCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmartDeviceCommand" ADD CONSTRAINT "SmartDeviceCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SmartDeviceCommand" ADD CONSTRAINT "SmartDeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SmartDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmartWebhookEvent" ADD CONSTRAINT "SmartWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SmartWebhookEvent" ADD CONSTRAINT "SmartWebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
