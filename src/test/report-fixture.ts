import type { ClientReport } from "@/server/client-report";
import { emptyTotals, type MetricTotals } from "@/lib/metrics";
import { DEFAULT_TEMPLATE } from "@/lib/report-template";

// A client report shaped like a real Meta-only dental client's October:
// a consult campaign, a call campaign, an awareness campaign and a paused
// test, with real daily spend and calls. Pacing detail and history are left
// empty (those sections are switched off), so pure renderers can be tested
// without a database.

const totals = (t: Partial<MetricTotals>): MetricTotals => ({ ...emptyTotals(), leadsReported: true, ...t });
const sum = (...xs: MetricTotals[]) =>
  xs.reduce((a, b) => totals({ costMinor: a.costMinor + b.costMinor, impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, conversions: a.conversions + b.conversions }), totals({}));

// [day, spend in dollars, calls placed]
const DAILY: [number, number, number][] = [
  [1, 150, 0], [2, 147, 0], [3, 74, 0], [4, 95, 0], [5, 129, 1], [6, 176, 2], [7, 157, 3], [8, 178, 5], [9, 148, 1], [10, 58, 0], [11, 77, 0],
  [12, 142, 1], [13, 138, 0], [14, 136, 1], [15, 127, 1], [16, 100, 1], [17, 50, 0], [18, 74, 0], [19, 132, 3], [20, 110, 1], [21, 143, 2],
  [22, 134, 1], [23, 120, 0], [24, 57, 0], [25, 69, 0], [26, 145, 0], [27, 140, 1], [28, 119, 1], [29, 118, 1], [30, 124, 2], [31, 55, 0],
];

export function polishedOctoberReport(overrides: { pacing?: boolean; logoUrl?: string | null } = {}): ClientReport {
  const consult = totals({ costMinor: 153_941, impressions: 139_292, clicks: 4_935, conversions: 0 });
  const calls = totals({ costMinor: 152_146, impressions: 101_294, clicks: 1_089, conversions: 28 });
  const brand = totals({ costMinor: 35_172, impressions: 105_879, clicks: 249, conversions: 0 });
  const paused = totals({ costMinor: 20_714, impressions: 18_771, clicks: 217, conversions: 0 });
  const prevConsult = totals({ costMinor: 143_300, impressions: 111_198, clicks: 3_143, conversions: 1 });
  const prevCalls = totals({ costMinor: 127_868, impressions: 87_330, clicks: 947, conversions: 24 });
  const prevBrand = totals({ costMinor: 74_829, impressions: 225_310, clicks: 488, conversions: 0 });
  const prevPaused = totals({ costMinor: 36_303, impressions: 17_402, clicks: 422, conversions: 0 });
  const cur = sum(consult, calls, brand, paused);
  const prev = sum(prevConsult, prevCalls, prevBrand, prevPaused);
  const byDate = DAILY.map(([d, dollars, n]) => ({ date: `2026-10-${String(d).padStart(2, "0")}`, ...totals({ costMinor: dollars * 100, conversions: n }) }));
  const template = { ...DEFAULT_TEMPLATE, sections: { ...DEFAULT_TEMPLATE.sections, executive: false, pacing: !!overrides.pacing, history: false, platforms: false, notes: false, search: false, website: false } };
  return {
    client: {
      id: "c1",
      agencyId: "ag1",
      name: "Polished General and Cosmetic Dentistry",
      currency: "USD",
      timezone: "America/New_York",
      goal: "CALLS",
      logoUrl: overrides.logoUrl ?? null,
      accounts: [
        {
          id: "a1",
          name: "polished",
          platform: "META_ADS",
          isDemo: false,
          spendIsVerified: true,
          campaigns: [
            { id: "k1", name: "Lead form Campaign", status: "ENABLED" },
            { id: "k2", name: "Brand Campaign Call only", status: "ENABLED" },
            { id: "k3", name: "Brand Campaign 2026", status: "ENABLED" },
            { id: "k4", name: "Lead form Campaign - Leads", status: "PAUSED" },
            { id: "k5", name: "Old campaign that never ran", status: "PAUSED" },
          ],
        },
      ],
    },
    perf: { range: { from: "2026-10-01", to: "2026-10-31" }, totals: cur, byAccount: { a1: cur }, byCampaign: { k1: consult, k2: calls, k3: brand, k4: paused }, byDate },
    cmpPerf: { range: { from: "2026-08-31", to: "2026-09-30" }, totals: prev, byAccount: { a1: prev }, byCampaign: { k1: prevConsult, k2: prevCalls, k3: prevBrand, k4: prevPaused }, byDate: [] },
    range: { from: "2026-10-01", to: "2026-10-31" },
    cmpRange: { from: "2026-08-31", to: "2026-09-30" },
    preset: "last_month",
    compareMode: "previous_period",
    today: "2026-11-03",
    template,
    hasCustomTemplate: false,
    callsFromAds: null,
    notes: [],
    history: [],
    pacing: {
      period: { start: "2026-11-01", end: "2026-11-30" },
      rows: [],
      subRows: [],
      accounts: [],
      total: { budgetMinor: 330_000, actualToDateMinor: 21_700, projectedMinor: 325_100, periodStart: "2026-11-01", periodEnd: "2026-11-30", phase: "IN_PROGRESS", status: "ON_TARGET", forecastStatus: "ON_TARGET", pctBudgetConsumed: 6.6, series: [], asOf: "2026-11-02" },
    },
  } as unknown as ClientReport;
}
