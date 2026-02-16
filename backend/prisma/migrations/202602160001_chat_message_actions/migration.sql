ALTER TABLE "ChatMessage"
ADD COLUMN "replyToMessageId" TEXT,
ADD COLUMN "isEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" INTEGER;

CREATE INDEX "ChatMessage_replyToMessageId_idx" ON "ChatMessage"("replyToMessageId");

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_replyToMessageId_fkey"
FOREIGN KEY ("replyToMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_deletedByUserId_fkey"
FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChatMessageMention" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "messageId" TEXT NOT NULL,
  "mentionedUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessageMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageMention_messageId_mentionedUserId_key" ON "ChatMessageMention"("messageId", "mentionedUserId");
CREATE INDEX "ChatMessageMention_tenantId_mentionedUserId_idx" ON "ChatMessageMention"("tenantId", "mentionedUserId");

ALTER TABLE "ChatMessageMention"
ADD CONSTRAINT "ChatMessageMention_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageMention"
ADD CONSTRAINT "ChatMessageMention_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageMention"
ADD CONSTRAINT "ChatMessageMention_mentionedUserId_fkey"
FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
