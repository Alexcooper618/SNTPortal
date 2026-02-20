-- Add platform admin role
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'ADMIN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Extend tenant location data for weather/time widgets
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "timeZone" TEXT;

