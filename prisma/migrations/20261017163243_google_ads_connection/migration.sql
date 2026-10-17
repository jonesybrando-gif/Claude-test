-- AlterTable
ALTER TABLE "public"."AdAccount" ADD COLUMN     "loginCustomerId" TEXT;

-- AlterTable
ALTER TABLE "public"."PlatformConnection" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "lastError" TEXT;
