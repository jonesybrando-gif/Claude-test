-- Client goal
CREATE TYPE "ClientGoal" AS ENUM ('LEADS', 'CALLS', 'SALES', 'BOOKINGS', 'AWARENESS');
ALTER TABLE "Client" ADD COLUMN "goal" "ClientGoal";

-- Performance alerts
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'CPA_SPIKE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'RESULTS_DROP';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TRACKING_ZERO';

-- Per-client alert mutes
ALTER TABLE "Client" ADD COLUMN "mutedAlertTypes" "AlertType"[] DEFAULT ARRAY[]::"AlertType"[];

-- Setup checklist dismissal (server-side)
ALTER TABLE "Agency" ADD COLUMN "setupChecklistDismissedAt" TIMESTAMP(3);

-- Budgets repeat monthly; only whole-calendar-month budgets repeat.
ALTER TABLE "Budget" ADD COLUMN "repeatsMonthly" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Budget" SET "repeatsMonthly" = false
WHERE NOT (EXTRACT(DAY FROM "periodStart") = 1
       AND "periodEnd" = (date_trunc('month', "periodStart") + interval '1 month - 1 day')::date);
-- Past months never repeat: only budgets for the current month (or later) carry forward,
-- so deploying mid-month can't recreate last month's budgets for this month.
UPDATE "Budget" SET "repeatsMonthly" = false WHERE "periodEnd" < date_trunc('month', now())::date;
