-- Meta conversions now include calls placed. Clearing the completeness date
-- makes the next sync re-import each live Meta account's full history so
-- earlier months include calls too. Data stays in place until replaced.
UPDATE "AdAccount" SET "dataCompleteThrough" = NULL WHERE "platform" = 'META_ADS' AND "isDemo" = false;
