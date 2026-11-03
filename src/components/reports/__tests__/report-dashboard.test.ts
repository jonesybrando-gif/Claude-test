import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClientReport } from "@/server/client-report";
import { emptyTotals, type MetricTotals } from "@/lib/metrics";
import { BudgetCard, CampaignPerformance, changeBadge, ReportKpiTiles, SpendShare } from "../report-dashboard";
import { initials } from "@/lib/logo";

const totals = (t: Partial<MetricTotals>): MetricTotals => ({ ...emptyTotals(), leadsReported: true, ...t });

// A Meta-only client modelled on a real October: a consult campaign, a call campaign and a paused test.
function report(): ClientReport {
  const consult = totals({ costMinor: 153_941, impressions: 139_292, clicks: 3_465, conversions: 0 });
  const calls = totals({ costMinor: 152_146, impressions: 101_294, clicks: 816, conversions: 28 });
  const paused = totals({ costMinor: 20_714, impressions: 18_771, clicks: 196, conversions: 0 });
  const prevConsult = totals({ costMinor: 143_300, impressions: 111_198, clicks: 2_358, conversions: 1 });
  const prevCalls = totals({ costMinor: 120_568, impressions: 81_332, clicks: 711, conversions: 24 });
  const sum = (...xs: MetricTotals[]) => xs.reduce((a, b) => totals({ costMinor: a.costMinor + b.costMinor, impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, conversions: a.conversions + b.conversions }), totals({}));
  const cur = sum(consult, calls, paused);
  const prev = sum(prevConsult, prevCalls);
  return {
    client: {
      id: "c1",
      name: "Polished General and Cosmetic Dentistry",
      currency: "USD",
      goal: "CALLS",
      logoUrl: null,
      accounts: [
        {
          id: "a1",
          platform: "META_ADS",
          campaigns: [
            { id: "k1", name: "Lead form Campaign", status: "ACTIVE" },
            { id: "k2", name: "Brand Campaign Call only", status: "ACTIVE" },
            { id: "k3", name: "Lead form Campaign - Leads", status: "PAUSED" },
            { id: "k4", name: "Old campaign that never ran", status: "PAUSED" },
          ],
        },
      ],
    },
    perf: { totals: cur, byAccount: { a1: cur }, byCampaign: { k1: consult, k2: calls, k3: paused }, byDate: [] },
    cmpPerf: { totals: prev, byAccount: { a1: prev }, byCampaign: { k1: prevConsult, k2: prevCalls }, byDate: [] },
    range: { from: "2026-10-01", to: "2026-10-31" },
    cmpRange: { from: "2026-09-01", to: "2026-09-30" },
    today: "2026-11-03",
    callsFromAds: null,
    notes: [],
    pacing: { total: { budgetMinor: 330_000, actualToDateMinor: 21_700, projectedMinor: 325_100, periodStart: "2026-11-01", periodEnd: "2026-11-30", phase: "IN_PROGRESS", status: "ON_TARGET", pctBudgetConsumed: 6.6 } },
  } as unknown as ClientReport;
}

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("client report dashboard", () => {
  it("shows the headline figures as tiles with their change", () => {
    const out = html(createElement(ReportKpiTiles, { rep: report() }));
    expect(out).toContain("$3,268"); // spend
    expect(out).toContain(">28<"); // calls
    expect(out).toContain("▲ 12% so far"); // 28 vs 25, last days still being counted
    expect(out).toContain("Click-through rate");
  });

  it("lists only campaigns that ran, busiest first, under a totals row", () => {
    const out = html(createElement(CampaignPerformance, { rep: report() }));
    expect(out).toContain(">Total<");
    expect(out.indexOf("Lead form Campaign")).toBeLessThan(out.indexOf("Brand Campaign Call only"));
    expect(out).not.toContain("Old campaign that never ran");
    expect(out).toContain("Change compared with");
  });

  it("splits spend by campaign", () => {
    const out = html(createElement(SpendShare, { rep: report() }));
    expect(out).toContain("Where the budget went");
    expect(out).toContain("47%"); // consult campaign share of $3,268
  });

  it("shows budget pacing only when there is a budget", () => {
    expect(html(createElement(BudgetCard, { rep: report() }))).toContain("of $3,300");
    const none = { ...report(), pacing: { total: null } } as unknown as ClientReport;
    expect(html(createElement(BudgetCard, { rep: none }))).toBe("");
  });
});

describe("changeBadge", () => {
  it("words small samples and small moves plainly", () => {
    expect(changeBadge("Calls", 3, 2, "2", { better: "up", sample: { current: 3, previous: 2 } })?.badge).toBe("Too few to compare");
    expect(changeBadge("Clicks", 1010, 1000, "1,000", { better: "up" })?.badge).toBe("About the same");
    expect(changeBadge("Cost", 50, 100, "$1", { better: "down" })).toMatchObject({ badge: "▼ 50%", tone: "good" });
    expect(changeBadge("Clicks", 10, null, "—", { better: "up" })).toBeNull();
  });
});

describe("initials", () => {
  it("uses the first two meaningful words", () => {
    expect(initials("Polished General and Cosmetic Dentistry")).toBe("PG");
    expect(initials("The ABC Plumbing Co")).toBe("AP");
    expect(initials("x")).toBe("X");
  });
});
