-- Additive only: optional password on shared report links.
ALTER TABLE "ReportShareLink" ADD COLUMN "passwordHash" TEXT;
