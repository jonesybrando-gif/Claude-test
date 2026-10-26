-- CreateTable
CREATE TABLE "FormRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT,
    "formUrl" TEXT,
    "referrer" TEXT,
    "referringUrl" TEXT,
    "firstForm" BOOLEAN NOT NULL DEFAULT false,
    "leadStatus" TEXT,

    CONSTRAINT "FormRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormRecord_assetId_externalId_key" ON "FormRecord"("assetId", "externalId");

-- CreateIndex
CREATE INDEX "FormRecord_clientId_date_idx" ON "FormRecord"("clientId", "date");

-- CreateIndex
CREATE INDEX "FormRecord_assetId_date_idx" ON "FormRecord"("assetId", "date");

-- AddForeignKey
ALTER TABLE "FormRecord" ADD CONSTRAINT "FormRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "DataAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-import CallRail history again so form details and the answered/missed split cover 13 months.
UPDATE "DataAsset" SET "dataCompleteThrough" = NULL, "lastSyncAttemptAt" = NULL WHERE "kind" = 'CALLRAIL_COMPANY';
