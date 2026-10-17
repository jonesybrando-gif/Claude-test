import { formatMoney } from "./money";
import type { PacingStatus } from "./pacing/status";

export type ActionSeverity = "critical" | "warning" | "info" | "ok";

export interface ActionInput {
  status: PacingStatus;
  /** Month-end forecast status; when worse than `status`, it drives the recommendation. */
  forecastStatus?: PacingStatus;
  currency: string;
  budgetMinor: number;
  actualToDateMinor: number;
  projectedVarianceMinor: number;
  requiredDailyMinor: number | null;
  currentDailyRateMinor: number;
  remainingActiveDays: number;
  phase: "NOT_STARTED" | "ACTIVE" | "ENDED";
  stale: boolean;
  disconnected: boolean;
}

export interface Action {
  severity: ActionSeverity;
  headline: string;
  detail: string;
}

const money = (m: number, c: string) => formatMoney(Math.abs(m), c, { whole: true });

/**
 * Turns a pacing result into a concrete recommendation. Recommendations are
 * advisory only — the application never changes platform budgets itself.
 */
export function recommendAction(a: ActionInput): Action {
  if (a.disconnected) {
    return { severity: "critical", headline: "Account disconnected", detail: "Reconnect the advertising account. Pacing below uses the last data received and may be out of date." };
  }
  const staleNote = a.stale ? " Data is stale — confirm in the ad platform before acting." : "";
  if (a.phase === "NOT_STARTED") {
    return { severity: "info", headline: "Budget period not started", detail: `No complete days of data yet.${staleNote}` };
  }
  if (a.phase === "ENDED") {
    const v = a.actualToDateMinor - a.budgetMinor;
    return {
      severity: Math.abs(v) <= a.budgetMinor * 0.05 ? "ok" : "warning",
      headline: "Budget period ended",
      detail: v > 0 ? `Finished ${money(v, a.currency)} over budget.` : `Finished ${money(v, a.currency)} under budget.`,
    };
  }
  const days = a.remainingActiveDays;
  // Act on whichever signal is further from target: pace so far, or the month-end forecast.
  const rank: Partial<Record<PacingStatus, number>> = { OVERSPENDING: 2, UNDERSPENDING: 2, SLIGHTLY_OVER: 1, SLIGHTLY_UNDER: 1 };
  const status = a.forecastStatus && (rank[a.forecastStatus] ?? 0) > (rank[a.status] ?? 0) ? a.forecastStatus : a.status;
  const forecastDriven = status !== a.status;
  const why = !forecastDriven
    ? ""
    : a.status === "ON_TARGET"
      ? " Spend so far is on plan, but the current daily rate will not land on the budget."
      : " The month-end forecast is further off than pacing to date suggests.";
  const dayWord = days === 1 ? "day" : "days";
  const req = a.requiredDailyMinor ?? 0;

  switch (status) {
    case "OVERSPENDING":
    case "SLIGHTLY_OVER": {
      const severity: ActionSeverity = status === "OVERSPENDING" ? "critical" : "warning";
      if (a.actualToDateMinor >= a.budgetMinor) {
        return {
          severity: "critical",
          headline: `Budget exhausted (${money(a.actualToDateMinor - a.budgetMinor, a.currency)} over)`,
          detail: `Pause or sharply reduce spend for the remaining ${days} ${dayWord}.${staleNote}`,
        };
      }
      return {
        severity,
        headline: `Projected to overspend by ${money(a.projectedVarianceMinor, a.currency)}`,
        detail: `Reduce average daily spend from ≈${money(a.currentDailyRateMinor, a.currency)} to ≈${money(req, a.currency)} for the remaining ${days} ${dayWord}.${why}${staleNote}`,
      };
    }
    case "UNDERSPENDING":
    case "SLIGHTLY_UNDER": {
      const severity: ActionSeverity = status === "UNDERSPENDING" ? "critical" : "warning";
      return {
        severity,
        headline: `Projected to underspend by ${money(a.projectedVarianceMinor, a.currency)}`,
        detail:
          days > 0
            ? `Increase average daily spend from ≈${money(a.currentDailyRateMinor, a.currency)} to ≈${money(req, a.currency)} to reach the monthly budget.${why}${staleNote}`
            : `No planned days remain in this period.${staleNote}`,
      };
    }
    case "ON_TARGET":
      return { severity: a.stale ? "warning" : "ok", headline: "On target", detail: `No action required.${staleNote}` };
    case "NO_BUDGET":
      return { severity: "info", headline: "No budget set", detail: "Enter a monthly budget to enable pacing." };
    case "NOT_STARTED":
      return { severity: "info", headline: "No spend planned yet", detail: `Planned spend starts later in the period.${staleNote}` };
  }
}
