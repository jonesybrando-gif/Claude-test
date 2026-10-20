import { describe, expect, it } from "vitest";
import { analyzePerformance } from "../insights";
import { autoExecutiveSummary } from "../exec-summary";
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
  // $10,000 for 100 conversions: $100 average.
  totals: t({ costMinor: 1_000_000, impressions: 100_000, clicks: 2_000, conversions: 100 }),
  previous: t({ costMinor: 900_000, impressions: 80_000, clicks: 2_000, conversions: 80 }),
  accounts: [],
  campaigns: [
    { name: "Emergency", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 500_000, conversions: 80 }), previous: t({ costMinor: 450_000, conversions: 50 }) },
    { name: "Brand", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 250_000, conversions: 20 }), previous: null },
    { name: "Display", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 250_000, conversions: 0 }), previous: null },
  ],
  pacing: null,
  notes: [],
};

describe("performance insights", () => {
  it("finds strong and wasted spend and recommends moving budget", () => {
    const r = analyzePerformance(base);
    expect(r.working[0]).toBe("Emergency (Google Ads) delivered 80 conversions at $62.50 each, 38% below the $100 average, on 50% of spend.");
    expect(r.notWorking).toContain("Display (Google Ads) spent $2,500 (25% of spend) without a single conversion.");
    expect(r.recommendations.some((x) => x.startsWith("Review Display (Google Ads)") && x.includes("move its $2,500 to Emergency (Google Ads)"))).toBe(true);
    expect(r.recommendations.some((x) => x.startsWith("Shift budget toward Emergency (Google Ads)"))).toBe(true);
    expect(r.working).toContain("Conversions rose 25% to 100, while cost per conversion fell 11%.");
  });

  it("flags costly campaigns, falling click-through rate and budget pacing", () => {
    const r = analyzePerformance({
      ...base,
      totals: t({ costMinor: 1_000_000, impressions: 100_000, clicks: 1_000, conversions: 100 }),
      campaigns: [
        { name: "Search", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 600_000, conversions: 90 }), previous: null },
        { name: "Prospecting", platform: "Meta Ads", status: "ACTIVE", totals: t({ costMinor: 400_000, conversions: 10 }), previous: null },
      ],
      pacing: {
        periodStart: "2026-10-01", periodEnd: "2026-10-31", asOf: "2026-10-16", status: "OVERSPENDING", forecastStatus: "OVERSPENDING",
        budgetMinor: 500000, actualToDateMinor: 322500, expectedToDateMinor: 258100, projectedMinor: 624900, requiredDailyMinor: 11800, currentDailyRateMinor: 20000, remainingActiveDays: 15, pacingPct: 125,
      },
    });
    expect(r.notWorking).toContain("Prospecting (Meta Ads) paid $400 per conversion, 4× the $100 average, across 40% of spend.");
    expect(r.notWorking).toContain("Click-through rate fell 60% to 1%, so the ads are drawing fewer clicks per impression.");
    expect(r.notWorking).toContain("The budget is on course to overspend: projected $6,249 against $5,000.");
    expect(r.recommendations).toContain("Lower daily spend from about $200 to $118 for the remaining 15 days to land on the $5,000 budget.");
    expect(r.recommendations.some((x) => x.startsWith("Refresh ad copy and creative"))).toBe(true);
    expect(r.notWorking).toContain("Cost per click rose 122% to $10.00, so each visit is getting more expensive.");
    expect(r.working).toContain("Conversion rate improved 150% to 10%, so more of the people who click are taking action.");
  });

  it("calls out missing tracking, placeholder conversion values and stale data", () => {
    const none = analyzePerformance({ ...base, previous: null, totals: t({ costMinor: 50_000, clicks: 300 }), campaigns: [] });
    expect(none.notWorking).toEqual(["$500 was spent with no conversions or leads reported."]);
    expect(none.recommendations[0]).toMatch(/^Set up or repair conversion tracking/);

    const placeholder = analyzePerformance({ ...base, previous: null, campaigns: [], totals: t({ costMinor: 1_000_000, conversions: 50, conversionValueMinor: 5_000 }) });
    expect(placeholder.recommendations.some((x) => x.startsWith("Give conversions real values"))).toBe(true);

    const stale = analyzePerformance({ ...base, accounts: [{ platform: "Meta Ads", name: "Main", totals: null, spendVerified: true, dataNote: "disconnected; data may be missing" }] });
    expect(stale.notWorking).toContain("Meta Ads · Main is disconnected; data may be missing, so these figures may be incomplete.");
    expect(stale.recommendations.at(-1)).toBe("Reconnect Meta Ads · Main on the Ad accounts page so the report is complete.");
  });

  it("judges lead-gen reports on leads, and says nothing for an empty period", () => {
    const r = analyzePerformance({
      ...base,
      previous: null,
      totals: t({ costMinor: 300_000, leads: 30, leadsReported: true }),
      campaigns: [
        { name: "Leads A", platform: "Meta Ads", status: "ACTIVE", totals: t({ costMinor: 150_000, leads: 25 }), previous: null },
        { name: "Leads B", platform: "Meta Ads", status: "ACTIVE", totals: t({ costMinor: 150_000, leads: 5 }), previous: null },
      ],
    });
    expect(r.working[0]).toBe("Leads A (Meta Ads) delivered 25 leads at $60.00 each, 40% below the $100 average, on 50% of spend.");
    expect(r.notWorking[0]).toBe("Leads B (Meta Ads) paid $300 per lead, 3× the $100 average, across 50% of spend.");
    expect(analyzePerformance({ ...base, totals: emptyTotals() })).toEqual({ working: [], notWorking: [], recommendations: [] });
  });

  it("names the most efficient campaign even without a clear standout, and judges reported value", () => {
    const r = analyzePerformance({
      ...base,
      previous: null,
      totals: t({ costMinor: 1_000_000, clicks: 2_000, conversions: 100, conversionValueMinor: 3_000_000 }),
      campaigns: [
        { name: "A", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 500_000, conversions: 55 }), previous: null },
        { name: "B", platform: "Google Ads", status: "ENABLED", totals: t({ costMinor: 500_000, conversions: 45 }), previous: null },
      ],
    });
    expect(r.working[0]).toBe("A (Google Ads) is the most efficient campaign: 55 conversions at $90.91 each, against the $100 average.");
    expect(r.working).toContain("Every $1.00 of ad spend returned $3.00 in platform-reported conversion value.");
    expect(r.recommendations.some((x) => x.startsWith("Give A (Google Ads) more room"))).toBe(true);
  });

  it("follows a past month's budget miss with a daily spend target", () => {
    const r = analyzePerformance({ ...base, range: { from: "2026-09-01", to: "2026-09-30" }, pastBudget: { month: "September 2026", budgetMinor: 500000, spentMinor: 547600, status: "OVERSPENDING" } });
    expect(r.notWorking).toContain("September 2026 closed over budget: $5,476 against $5,000 (110%).");
    expect(r.recommendations).toContain("Rein in daily spend this month: September 2026 ran 10% over budget. At the same budget, campaign daily budgets should add up to about $167 a day.");
    expect(r.recommendations.some((x) => x.startsWith("Results are steady"))).toBe(false);
  });

  it("is part of the automatic executive summary", () => {
    const s = autoExecutiveSummary(base);
    expect(s.overview).toContain("ABC Plumbing's ads earned");
    expect(s.working.length).toBeGreaterThan(0);
    expect(s.recommendations.length).toBeGreaterThan(0);
  });
});
