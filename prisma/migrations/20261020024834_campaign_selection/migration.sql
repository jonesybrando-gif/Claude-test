-- AlterTable
ALTER TABLE "AdAccount" ADD COLUMN     "includeNewCampaigns" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "excludedAt" TIMESTAMP(3);
