-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "slackWebhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "snoozedUntil" TIMESTAMP(3);
