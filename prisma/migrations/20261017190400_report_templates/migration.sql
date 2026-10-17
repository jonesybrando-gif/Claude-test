-- AlterTable
ALTER TABLE "public"."Report" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'SAVED';

-- CreateIndex
CREATE INDEX "Report_agencyId_kind_clientId_idx" ON "public"."Report"("agencyId", "kind", "clientId");
