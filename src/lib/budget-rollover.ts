import { addDays, monthBounds, type IsoDate } from "./pacing/dates";
import { validateNewBudget, type ExistingBudget } from "./budget-validation";

// Pure planning for carrying budgets into the next calendar month. The server
// (src/server/budget-rollover.ts) loads budgets, calls these, and writes the
// result inside a per-client lock, re-planning there so repeated or
// concurrent runs never create duplicates.

export interface RolloverBudget extends ExistingBudget {
  repeatsMonthly: boolean;
}

export interface PlannedCopy<B extends RolloverBudget = RolloverBudget> {
  source: B;
  periodStart: IsoDate;
  periodEnd: IsoDate;
}

/** True when the period is exactly one whole calendar month (1st through last day). */
export function isWholeMonth(periodStart: IsoDate, periodEnd: IsoDate): boolean {
  const m = monthBounds(periodStart);
  return m.start === periodStart && m.end === periodEnd;
}

/** The calendar month after the one containing `d`. */
export function nextMonth(d: IsoDate): { start: IsoDate; end: IsoDate } {
  return monthBounds(addDays(monthBounds(d).end, 1));
}

/** The calendar month before the one containing `d`. */
export function previousMonth(d: IsoDate): { start: IsoDate; end: IsoDate } {
  return monthBounds(addDays(monthBounds(d).start, -1));
}

/**
 * Which budgets of ONE client to copy from `sourceMonth` into the month after it.
 *
 * - Only whole-calendar-month budgets in the source month are considered.
 * - `onlyRepeating`: skip budgets with repeatsMonthly = false (automatic roll-forward);
 *   the one-click copy passes false and copies every whole-month budget.
 * - A budget is skipped when the target month already has a budget for the same
 *   target (client / account / campaign), or when copying it would break the
 *   "overlapping budgets share one period" rule (e.g. the next month already
 *   has a custom-period budget).
 *
 * Idempotent: planning again after the copies exist returns nothing.
 */
export function planMonthCopy<B extends RolloverBudget>(budgets: B[], sourceMonth: IsoDate, opts: { onlyRepeating: boolean }): PlannedCopy<B>[] {
  const src = monthBounds(sourceMonth);
  const target = nextMonth(sourceMonth);
  const existing: ExistingBudget[] = budgets.map((b) => ({ id: b.id, scope: b.scope, accountId: b.accountId, campaignId: b.campaignId, periodStart: b.periodStart, periodEnd: b.periodEnd }));
  const out: PlannedCopy<B>[] = [];
  const sources = budgets
    .filter((b) => b.periodStart === src.start && b.periodEnd === src.end)
    .filter((b) => !opts.onlyRepeating || b.repeatsMonthly)
    // Stable order so CLIENT budgets are planned before ACCOUNT before CAMPAIGN.
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id));
  for (const b of sources) {
    const candidate = { scope: b.scope, accountId: b.accountId, campaignId: b.campaignId, periodStart: target.start, periodEnd: target.end, amountMinor: 0 };
    if (validateNewBudget(candidate, existing).length > 0) continue;
    out.push({ source: b, periodStart: target.start, periodEnd: target.end });
    existing.push({ id: `planned:${b.id}`, ...candidate });
  }
  return out;
}

/** The automatic roll-forward: last month's repeating budgets into the month containing `today`. */
export function planRollForward<B extends RolloverBudget>(budgets: B[], today: IsoDate): PlannedCopy<B>[] {
  return planMonthCopy(budgets, previousMonth(today).start, { onlyRepeating: true });
}

/** The one-click copy: this month's whole-month budgets into next month. */
export function planCopyToNextMonth<B extends RolloverBudget>(budgets: B[], today: IsoDate): PlannedCopy<B>[] {
  return planMonthCopy(budgets, monthBounds(today).start, { onlyRepeating: false });
}

/** The banner is offered from this day of the month. */
export const COPY_BANNER_FROM_DAY = 25;

export function monthName(d: IsoDate): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}
