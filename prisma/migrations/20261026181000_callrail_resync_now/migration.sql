-- Make CallRail companies due right away so the full re-import starts on the next scheduler run.
UPDATE "DataAsset" SET "lastSyncAttemptAt" = NULL WHERE "kind" = 'CALLRAIL_COMPANY' AND "dataCompleteThrough" IS NULL;
