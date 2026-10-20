import { describe, expect, it } from "vitest";
import { autoOverview as autoExecutiveSummary } from "../exec-summary";
import type { AiContextInput } from "../ai-context";
import { emptyTotals, type MetricTotals } from "../metrics";

const t = (o: Partial<MetricTotals>): MetricTotals => ({ ...emptyTotals(), ...o });
const base: AiContextInput = {
  clientName: "ABC Plumbing",
  currency: "USD",
  isDemo: false,
  rangeLabel: "Last 30 days",
  range: { from: "2026-09-17", to: "2026-10-16" },
  comparison: { from: "2026-08-18", to: "2026-09-16" },
  kpis: ["spend"],
  totals: t({ costMinor: 575000, impressions: 16000, clicks: 880, conversions: 79.4, conversionValueMinor: 3336100 }),
  previous: t({ costMinor: 538600, impressions: 14926, clicks: 821, conversions: 75.5, conversionValueMinor: 3170200 }),
  accounts: [],
  campaigns: [
    { name: "Emergency", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 287500, conversions: 40.3 }), previous: null },
    { name: "Heaters", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 172500, conversions: 23.3 }), previous: null },
  ],
  pacing: {
    periodStart: "2026-10-01", periodEnd: "2026-10-31", asOf: "2026-10-16", status: "OVERSPENDING", forecastStatus: "OVERSPENDING",
    budgetMinor: 500000, actualToDateMinor: 322500, expectedToDateMinor: 258100, projectedMinor: 624900, requiredDailyMinor: 11800, currentDailyRateMinor: 20000, remainingActiveDays: 15, pacingPct: 125,
  },
  notes: [],
};

describe("automatic executive summary", () => {
  it("describes the selected range with changes, results, top campaign and budget", () => {
    const s = autoExecutiveSummary(base);
    const [p1, p2] = s.split("\n\n");
    expect(p1).toContain("From Sep 17 – Oct 16, 2026 (last 30 days), ABC Plumbing's ads earned 16,000 impressions and 880 clicks (up 7%) on $5,750 of spend (up 7%).");
    expect(p1).toContain("79.4 conversions at $72.42 each (up 2%)");
    expect(p1).toContain("a 5.80× return on ad spend");
    expect(p2).toContain("The largest campaign was Emergency on Google Ads, with $2,875 (50% of spend) and 40.3 conversions.");
    expect(p2).toContain("For October, $3,225 of the $5,000 budget has been spent through Oct 16, ahead of plan; at the current pace the month would end at $6,249.");
  });

  it("uses the final budget result for a past month and skips current pacing", () => {
    const s = autoExecutiveSummary({ ...base, rangeLabel: "Last month", range: { from: "2026-09-01", to: "2026-09-30" }, pastBudget: { month: "September 2026", budgetMinor: 500000, spentMinor: 547600, status: "OVERSPENDING" } });
    expect(s).toContain("September 2026 finished at $5,476 against a $5,000 budget (110%).");
    expect(s).not.toContain("For October");
  });

  it("handles no comparison, no results, no activity and demo data", () => {
    const noCmp = autoExecutiveSummary({ ...base, previous: null, totals: t({ costMinor: 10000, clicks: 20 }), campaigns: [], pacing: null });
    expect(noCmp).not.toMatch(/up|down/);
    expect(noCmp).toContain("No conversions or leads were reported");
    expect(autoExecutiveSummary({ ...base, totals: emptyTotals(), isDemo: true })).toBe("These figures are illustrative demo data. No advertising activity was recorded for ABC Plumbing from Sep 17 – Oct 16, 2026.");
  });
});
