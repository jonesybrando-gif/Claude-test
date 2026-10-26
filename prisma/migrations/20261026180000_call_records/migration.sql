-- CreateTable
CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "date" DATE NOT NULL,
    "callerName" TEXT,
    "callerNumber" TEXT,
    "city" TEXT,
    "state" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "keyword" TEXT,
    "landingPage" TEXT,
    "trackingNumber" TEXT,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "voicemail" BOOLEAN NOT NULL DEFAULT false,
    "firstCall" BOOLEAN NOT NULL DEFAULT false,
    "leadStatus" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordingUrl" TEXT,

    CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallRecord_assetId_externalId_key" ON "CallRecord"("assetId", "externalId");

-- CreateIndex
CREATE INDEX "CallRecord_clientId_date_idx" ON "CallRecord"("clientId", "date");

-- CreateIndex
CREATE INDEX "CallRecord_assetId_date_idx" ON "CallRecord"("assetId", "date");

-- AddForeignKey
ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-import CallRail history so the new metrics, breakdowns and call log cover the full 13 months.
UPDATE "DataAsset" SET "dataCompleteThrough" = NULL WHERE "kind" = 'CALLRAIL_COMPANY';
