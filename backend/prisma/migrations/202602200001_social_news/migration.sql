-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NewsMediaType" AS ENUM ('IMAGE', 'VIDEO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "NewsPost"
  ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';

-- Backfill previous drafts as published
UPDATE "NewsPost"
SET
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "status" = 'DRAFT';

-- AlterTable
ALTER TABLE "NewsAttachment"
  ADD COLUMN IF NOT EXISTS "mediaType" "NewsMediaType",
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "NewsAttachment"
SET
  "mediaType" = COALESCE("mediaType", 'IMAGE'::"NewsMediaType"),
  "mimeType" = COALESCE(NULLIF("mimeType", ''), 'image/jpeg'),
  "sizeBytes" = COALESCE("sizeBytes", 0);

ALTER TABLE "NewsAttachment"
  ALTER COLUMN "mediaType" SET NOT NULL,
  ALTER COLUMN "mimeType" SET NOT NULL,
  ALTER COLUMN "sizeBytes" SET NOT NULL;

-- CreateTable
CREATE TABLE "NewsPostLike" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsComment" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "postId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsStory" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "caption" TEXT,
    "mediaType" "NewsMediaType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsStoryView" (
    "id" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsStoryView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsAttachment_postId_sortOrder_idx" ON "NewsAttachment"("postId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPostLike_postId_userId_key" ON "NewsPostLike"("postId", "userId");

-- CreateIndex
CREATE INDEX "NewsPostLike_tenantId_postId_createdAt_idx" ON "NewsPostLike"("tenantId", "postId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsPostLike_tenantId_userId_createdAt_idx" ON "NewsPostLike"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsComment_tenantId_postId_createdAt_idx" ON "NewsComment"("tenantId", "postId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsComment_tenantId_authorId_createdAt_idx" ON "NewsComment"("tenantId", "authorId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsStory_tenantId_expiresAt_createdAt_idx" ON "NewsStory"("tenantId", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "NewsStory_tenantId_authorId_createdAt_idx" ON "NewsStory"("tenantId", "authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsStoryView_storyId_userId_key" ON "NewsStoryView"("storyId", "userId");

-- CreateIndex
CREATE INDEX "NewsStoryView_tenantId_userId_viewedAt_idx" ON "NewsStoryView"("tenantId", "userId", "viewedAt");

-- AddForeignKey
ALTER TABLE "NewsPostLike" ADD CONSTRAINT "NewsPostLike_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPostLike" ADD CONSTRAINT "NewsPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NewsPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsPostLike" ADD CONSTRAINT "NewsPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsComment" ADD CONSTRAINT "NewsComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsComment" ADD CONSTRAINT "NewsComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NewsPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsComment" ADD CONSTRAINT "NewsComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStory" ADD CONSTRAINT "NewsStory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStory" ADD CONSTRAINT "NewsStory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStoryView" ADD CONSTRAINT "NewsStoryView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStoryView" ADD CONSTRAINT "NewsStoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "NewsStory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsStoryView" ADD CONSTRAINT "NewsStoryView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
