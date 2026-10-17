-- CreateEnum
CREATE TYPE "public"."AuthTokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('SENT', 'FAILED', 'NOT_CONFIGURED');

-- AlterTable
ALTER TABLE "public"."Agency" ADD COLUMN     "alertSettings" JSONB;

-- AlterTable
ALTER TABLE "public"."Alert" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'warning';

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "dailySummary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastDailySummaryAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailMessage" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "kind" TEXT NOT NULL,
    "status" "public"."EmailStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "public"."AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "public"."AuthToken"("userId", "type");

-- CreateIndex
CREATE INDEX "EmailMessage_agencyId_createdAt_idx" ON "public"."EmailMessage"("agencyId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
