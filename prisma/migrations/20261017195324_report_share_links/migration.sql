-- CreateTable
CREATE TABLE "public"."ReportShareLink" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "label" TEXT,
    "range" TEXT,
    "compare" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReportShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportShareLink_tokenHash_key" ON "public"."ReportShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ReportShareLink_clientId_createdAt_idx" ON "public"."ReportShareLink"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ReportShareLink" ADD CONSTRAINT "ReportShareLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
