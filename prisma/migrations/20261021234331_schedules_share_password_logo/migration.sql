-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "logoData" TEXT;

-- AlterTable
ALTER TABLE "ReportShareLink" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "ClientReportSchedule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "recipients" TEXT NOT NULL,
    "range" TEXT NOT NULL DEFAULT 'last_month',
    "attachPdf" BOOLEAN NOT NULL DEFAULT true,
    "includeLink" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientReportSchedule_clientId_key" ON "ClientReportSchedule"("clientId");

-- CreateIndex
CREATE INDEX "ClientReportSchedule_active_nextRunAt_idx" ON "ClientReportSchedule"("active", "nextRunAt");

-- AddForeignKey
ALTER TABLE "ClientReportSchedule" ADD CONSTRAINT "ClientReportSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
