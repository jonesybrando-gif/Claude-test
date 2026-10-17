-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('AGENCY_ADMIN', 'ACCOUNT_MANAGER', 'CLIENT_USER');

-- CreateEnum
CREATE TYPE "public"."Platform" AS ENUM ('GOOGLE_ADS', 'META_ADS', 'MICROSOFT_ADS', 'GOOGLE_LSA');

-- CreateEnum
CREATE TYPE "public"."ConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'DISCONNECTED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "public"."CampaignStatus" AS ENUM ('ENABLED', 'PAUSED', 'REMOVED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."BudgetScope" AS ENUM ('CLIENT', 'ACCOUNT', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "public"."DistributionMode" AS ENUM ('EVEN', 'BUSINESS_DAYS', 'WEEKEND_WEIGHTED', 'CUSTOM_WEEKDAY', 'CUSTOM_DAILY');

-- CreateEnum
CREATE TYPE "public"."ForecastModel" AS ENUM ('STRAIGHT_LINE', 'TRAILING_7_DAY');

-- CreateEnum
CREATE TYPE "public"."SyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."AlertType" AS ENUM ('OVERSPENDING', 'UNDERSPENDING', 'PROJECTED_OVERRUN', 'SPEND_SPIKE', 'SPEND_STOPPED', 'CAMPAIGN_NO_SPEND', 'SYNC_FAILED', 'ACCOUNT_DISCONNECTED');

-- CreateEnum
CREATE TYPE "public"."AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "public"."Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "reportHeader" TEXT,
    "reportFooter" TEXT,
    "thresholdUnder" DECIMAL(6,2) NOT NULL DEFAULT 85,
    "thresholdSlightlyUnder" DECIMAL(6,2) NOT NULL DEFAULT 95,
    "thresholdSlightlyOver" DECIMAL(6,2) NOT NULL DEFAULT 105,
    "thresholdOver" DECIMAL(6,2) NOT NULL DEFAULT 115,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientAssignment" (
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("userId","clientId")
);

-- CreateTable
CREATE TABLE "public"."Client" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "primaryManagerId" TEXT,
    "thresholdUnder" DECIMAL(6,2),
    "thresholdSlightlyUnder" DECIMAL(6,2),
    "thresholdSlightlyOver" DECIMAL(6,2),
    "thresholdOver" DECIMAL(6,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlatformConnection" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "label" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "public"."ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OAuthCredential" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "connectionId" TEXT,
    "platform" "public"."Platform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "spendIsVerified" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAttemptAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "dataCompleteThrough" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Campaign" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."CampaignStatus" NOT NULL DEFAULT 'UNKNOWN',
    "platformDailyBudgetMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Budget" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scope" "public"."BudgetScope" NOT NULL,
    "accountId" TEXT,
    "campaignId" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "distribution" "public"."DistributionMode" NOT NULL DEFAULT 'EVEN',
    "weekendWeight" DECIMAL(6,3),
    "weekdayWeights" JSONB,
    "dailyWeights" JSONB,
    "pauses" JSONB,
    "forecastModel" "public"."ForecastModel" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BudgetRevision" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyPerformance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT,
    "date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "costMinor" BIGINT NOT NULL DEFAULT 0,
    "costIsEstimated" BOOLEAN NOT NULL DEFAULT false,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "reach" BIGINT,
    "conversions" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "conversionValueMinor" BIGINT NOT NULL DEFAULT 0,
    "leads" DECIMAL(14,4),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversionMetric" (
    "id" TEXT NOT NULL,
    "performanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "valueMinor" BIGINT,

    CONSTRAINT "ConversionMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SyncRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "public"."SyncStatus" NOT NULL,
    "rangeStart" DATE,
    "rangeEnd" DATE,
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Alert" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT,
    "accountId" TEXT,
    "type" "public"."AlertType" NOT NULL,
    "status" "public"."AlertStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertId" TEXT,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportSchedule" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "recipients" TEXT[],
    "lastSentAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "public"."Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_agencyId_idx" ON "public"."User"("agencyId");

-- CreateIndex
CREATE INDEX "Client_agencyId_idx" ON "public"."Client"("agencyId");

-- CreateIndex
CREATE INDEX "PlatformConnection_agencyId_platform_idx" ON "public"."PlatformConnection"("agencyId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCredential_connectionId_key" ON "public"."OAuthCredential"("connectionId");

-- CreateIndex
CREATE INDEX "AdAccount_clientId_idx" ON "public"."AdAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_platform_externalId_clientId_key" ON "public"."AdAccount"("platform", "externalId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_accountId_externalId_key" ON "public"."Campaign"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "Budget_clientId_periodStart_idx" ON "public"."Budget"("clientId", "periodStart");

-- CreateIndex
CREATE INDEX "Budget_accountId_idx" ON "public"."Budget"("accountId");

-- CreateIndex
CREATE INDEX "Budget_campaignId_idx" ON "public"."Budget"("campaignId");

-- CreateIndex
CREATE INDEX "BudgetRevision_budgetId_effectiveDate_idx" ON "public"."BudgetRevision"("budgetId", "effectiveDate");

-- CreateIndex
CREATE INDEX "DailyPerformance_accountId_date_idx" ON "public"."DailyPerformance"("accountId", "date");

-- CreateIndex
CREATE INDEX "DailyPerformance_campaignId_date_idx" ON "public"."DailyPerformance"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPerformance_accountId_campaignId_date_key" ON "public"."DailyPerformance"("accountId", "campaignId", "date");

-- CreateIndex
CREATE INDEX "ConversionMetric_performanceId_idx" ON "public"."ConversionMetric"("performanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_base_quote_key" ON "public"."ExchangeRate"("date", "base", "quote");

-- CreateIndex
CREATE INDEX "SyncRun_accountId_startedAt_idx" ON "public"."SyncRun"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "Alert_agencyId_status_idx" ON "public"."Alert"("agencyId", "status");

-- CreateIndex
CREATE INDEX "Alert_dedupeKey_status_idx" ON "public"."Alert"("dedupeKey", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "public"."Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientAssignment" ADD CONSTRAINT "ClientAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "public"."Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_primaryManagerId_fkey" FOREIGN KEY ("primaryManagerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlatformConnection" ADD CONSTRAINT "PlatformConnection_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "public"."Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthCredential" ADD CONSTRAINT "OAuthCredential_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."PlatformConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdAccount" ADD CONSTRAINT "AdAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Campaign" ADD CONSTRAINT "Campaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Budget" ADD CONSTRAINT "Budget_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Budget" ADD CONSTRAINT "Budget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Budget" ADD CONSTRAINT "Budget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetRevision" ADD CONSTRAINT "BudgetRevision_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "public"."Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetRevision" ADD CONSTRAINT "BudgetRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyPerformance" ADD CONSTRAINT "DailyPerformance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyPerformance" ADD CONSTRAINT "DailyPerformance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversionMetric" ADD CONSTRAINT "ConversionMetric_performanceId_fkey" FOREIGN KEY ("performanceId") REFERENCES "public"."DailyPerformance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SyncRun" ADD CONSTRAINT "SyncRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "public"."Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public"."Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "public"."Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportSchedule" ADD CONSTRAINT "ReportSchedule_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
