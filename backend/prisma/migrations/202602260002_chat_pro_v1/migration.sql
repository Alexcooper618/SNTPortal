DO $$ BEGIN
  CREATE TYPE "ChatMediaType" AS ENUM ('VOICE', 'VIDEO_NOTE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PushDevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ChatRoom"
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "photoUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdByUserId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "ChatRoom"
    ADD CONSTRAINT "ChatRoom_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ChatMessageAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "messageId" TEXT NOT NULL,
  "authorId" INTEGER NOT NULL,
  "mediaType" "ChatMediaType" NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "durationSec" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ChatMessageAttachment"
    ADD CONSTRAINT "ChatMessageAttachment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessageAttachment"
    ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessageAttachment"
    ADD CONSTRAINT "ChatMessageAttachment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ChatMessageAttachment_tenantId_messageId_createdAt_idx"
  ON "ChatMessageAttachment"("tenantId", "messageId", "createdAt");

CREATE TABLE IF NOT EXISTS "ChatRoomNotificationSetting" (
  "id" TEXT NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "isMuted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatRoomNotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatRoomNotificationSetting_roomId_userId_key"
  ON "ChatRoomNotificationSetting"("roomId", "userId");

CREATE INDEX IF NOT EXISTS "ChatRoomNotificationSetting_tenantId_userId_isMuted_idx"
  ON "ChatRoomNotificationSetting"("tenantId", "userId", "isMuted");

DO $$ BEGIN
  ALTER TABLE "ChatRoomNotificationSetting"
    ADD CONSTRAINT "ChatRoomNotificationSetting_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatRoomNotificationSetting"
    ADD CONSTRAINT "ChatRoomNotificationSetting_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatRoomNotificationSetting"
    ADD CONSTRAINT "ChatRoomNotificationSetting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "PushDeviceToken" (
  "id" TEXT NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "PushDevicePlatform" NOT NULL DEFAULT 'ANDROID',
  "deviceName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushDeviceToken_token_key"
  ON "PushDeviceToken"("token");

CREATE INDEX IF NOT EXISTS "PushDeviceToken_tenantId_userId_platform_idx"
  ON "PushDeviceToken"("tenantId", "userId", "platform");

DO $$ BEGIN
  ALTER TABLE "PushDeviceToken"
    ADD CONSTRAINT "PushDeviceToken_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PushDeviceToken"
    ADD CONSTRAINT "PushDeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ChatMessage"
  DROP CONSTRAINT IF EXISTS "ChatMessage_replyToMessageId_fkey";

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_replyToMessageId_fkey"
  FOREIGN KEY ("replyToMessageId") REFERENCES "ChatMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
