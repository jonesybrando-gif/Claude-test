import { diffDays, type IsoDate } from "./pacing/dates";

export interface ExistingBudget {
  id: string;
  scope: "CLIENT" | "ACCOUNT" | "CAMPAIGN";
  accountId: string | null;
  campaignId: string | null;
  periodStart: IsoDate;
  periodEnd: IsoDate;
}

export interface NewBudget {
  scope: "CLIENT" | "ACCOUNT" | "CAMPAIGN";
  accountId: string | null;
  campaignId: string | null;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amountMinor: number;
}

const overlaps = (a: { periodStart: string; periodEnd: string }, b: { periodStart: string; periodEnd: string }) =>
  a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;

/**
 * Returns a list of problems (empty = valid). Rules:
 * - amounts are non-negative whole minor units
 * - period is 1–366 days
 * - scope has the right target ids
 * - one budget per target per period (no overlaps)
 * - all of a client's budgets that overlap must share the same period, so the
 *   client roll-up compares like with like
 */
export function validateNewBudget(b: NewBudget, existing: ExistingBudget[]): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(b.amountMinor) || b.amountMinor < 0) errors.push("Budget must be a non-negative amount.");
  const len = diffDays(b.periodStart, b.periodEnd) + 1;
  if (len < 1) errors.push("Period end must be on or after period start.");
  if (len > 366) errors.push("Budget periods can be at most 366 days.");
  if (b.scope === "CLIENT" && (b.accountId || b.campaignId)) errors.push("A client budget cannot target an account or campaign.");
  if (b.scope === "ACCOUNT" && (!b.accountId || b.campaignId)) errors.push("Choose the advertising account for this budget.");
  if (b.scope === "CAMPAIGN" && !b.campaignId) errors.push("Choose the campaign for this budget.");

  for (const e of existing.filter((e) => overlaps(e, b))) {
    const sameTarget = e.scope === b.scope && e.accountId === b.accountId && e.campaignId === b.campaignId;
    if (sameTarget) {
      errors.push("A budget already exists for this target in an overlapping period. Revise it instead of adding another.");
      break;
    }
    if (e.periodStart !== b.periodStart || e.periodEnd !== b.periodEnd) {
      errors.push(`Other budgets for this client use the period ${e.periodStart} to ${e.periodEnd}. Budgets that overlap must use the same period.`);
      break;
    }
  }
  return errors;
}

export function validateRevision(periodStart: IsoDate, periodEnd: IsoDate, effectiveDate: IsoDate, amountMinor: number): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(amountMinor) || amountMinor < 0) errors.push("Budget must be a non-negative amount.");
  if (effectiveDate < periodStart || effectiveDate > periodEnd) errors.push("The effective date must fall inside the budget period.");
  return errors;
}
