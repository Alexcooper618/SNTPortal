ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passwordUpdatedAt" TIMESTAMP(3);
