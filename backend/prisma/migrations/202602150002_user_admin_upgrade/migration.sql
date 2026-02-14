ALTER TABLE "User"
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "PlotOwnership_plotId_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "PlotOwnership_one_primary_active_per_user"
ON "PlotOwnership" ("userId")
WHERE "isPrimary" = true AND "toDate" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PlotOwnership_one_active_membership_per_pair"
ON "PlotOwnership" ("plotId", "userId")
WHERE "toDate" IS NULL;
