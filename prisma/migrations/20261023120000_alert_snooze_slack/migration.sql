-- Additive only: alert snoozing and Slack delivery for alerts.
ALTER TABLE "Alert" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
ALTER TABLE "Agency" ADD COLUMN "slackWebhookEnc" TEXT;
