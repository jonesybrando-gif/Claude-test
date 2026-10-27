import { describe, expect, it } from "vitest";
import { formatKpi, kpiChangeWords, kpiValues, KPIS, untrackedKpis } from "../kpis";
import { METRICS } from "../metrics-registry";
import { PLAIN } from "../metrics-registry/plain";
import { addInto, emptyTotals, type MetricTotals } from "../metrics";

const t = (o: Partial<MetricTotals>): MetricTotals => ({ ...emptyTotals(), ...o });

describe("KPI catalog", () => {
  it("shows 0 leads when a lead-reporting platform had none, and — when no platform reports leads", () => {
    const [none] = kpiValues(["leads"], t({ costMinor: 5000, clicks: 20 }), null);
    expect(none.value).toBeNull();
    const meta = addInto(emptyTotals(), { costMinor: 5000, impressions: 900, clicks: 20, conversions: 0, conversionValueMinor: 0, leads: 0, leadsReported: true });
    const [zero, cpl] = kpiValues(["leads", "costPerLead"], meta, null);
    expect(zero.value).toBe(0);
    expect(cpl.value).toBeNull();
    expect(addInto(meta, { costMinor: 100, impressions: 0, clicks: 0, conversions: 0, conversionValueMinor: 0, leads: 0 }).leadsReported).toBe(true);
  });

  it("blends platforms as true ratios, not averages", () => {
    // Google: $100, 100 clicks (CPC $1). Meta: $100, 400 clicks (CPC $0.25). Blended CPC = $200/500 = $0.40.
    const blended = addInto(addInto(emptyTotals(), { costMinor: 10000, impressions: 2000, clicks: 100, conversions: 5, conversionValueMinor: 0, leads: 0 }), {
      costMinor: 10000, impressions: 20000, clicks: 400, conversions: 10, conversionValueMinor: 0, leads: 10,
    });
    const [cpc, ctr, cpa] = kpiValues(["cpc", "ctr", "costPerConversion"], blended, null);
    expect(cpc.value).toBe(40);
    expect(ctr.value).toBeCloseTo((500 / 22000) * 100, 10);
    expect(cpa.value).toBeCloseTo(20000 / 15, 10);
  });

  it("colours changes by whether up is good", () => {
    const cur = t({ costMinor: 12000, clicks: 100, leads: 10 });
    const prev = t({ costMinor: 10000, clicks: 100, leads: 10 });
    const [spend, cpc, clicks] = kpiValues(["spend", "cpc", "clicks"], cur, prev);
    expect(spend.tone).toBe("neutral"); // spending more isn't good or bad by itself
    expect(cpc.tone).toBe("bad"); // CPC up 20%
    expect(clicks.tone).toBe("neutral"); // unchanged
    expect(spend.changePct).toBeCloseTo(20, 10);
  });

  it("reports unknown values as null rather than zero", () => {
    const [roas, value, cpl] = kpiValues(["roas", "conversionValue", "costPerLead"], t({ costMinor: 5000 }), null);
    expect(roas.value).toBeNull();
    expect(value.value).toBeNull();
    expect(cpl.value).toBeNull();
    expect(formatKpi("roas", null)).toBe("—");
  });

  it("formats each kind", () => {
    expect(formatKpi("spend", 123456)).toBe("$1,235");
    expect(formatKpi("cpc", 653)).toBe("$6.53");
    expect(formatKpi("ctr", 5.5)).toBe("5.50%");
    expect(formatKpi("roas", 5.8)).toBe("5.80×");
    expect(formatKpi("conversions", 79.4)).toBe("79.4");
    expect(formatKpi("conversions", 2183.7)).toBe("2,184");
    expect(formatKpi("conversions", 79.4, "USD", { whole: true })).toBe("79");
    expect(formatKpi("impressions", 200499)).toBe("200,499");
  });

  it("every KPI has a definition", () => {
    expect(new Set(KPIS.map((k) => k.key)).size).toBe(KPIS.length);
    expect(KPIS.every((k) => k.plain.length > 10)).toBe(true);
  });

  it("every registry metric has a plain definition of its own", () => {
    const missing = METRICS.filter((m) => !PLAIN[m.key] && !m.plain).map((m) => m.key);
    expect(missing).toEqual([]);
  });

  it("puts changes in words, with small samples and late results held neutral", () => {
    const cur = t({ costMinor: 12000, clicks: 100, conversions: 8, leads: 30, leadCostMinor: 12000 });
    const prev = t({ costMinor: 10000, clicks: 100, conversions: 20, leads: 20, leadCostMinor: 10000 });
    const [spend, conv, cpl, leads] = kpiValues(["spend", "conversions", "costPerLead", "leads"], cur, prev);
    expect(kpiChangeWords(spend, "USD").text).toBe("Up 20% from $100");
    expect(kpiChangeWords(spend, "USD").aria).toContain("neither good nor bad on its own");
    expect(conv.verdict).toBe("few"); // 8 conversions
    expect(cpl.verdict).toBe("better"); // 30 vs 20 leads, cost per lead down 20%
    expect(kpiChangeWords(leads, "USD").text).toBe("Up 50% from 20 · better");
    const [lateLeads] = kpiValues(["leads"], cur, prev, { stillCounting: true });
    expect(lateLeads).toMatchObject({ verdict: "counting", tone: "neutral" });
  });

  it("divides only lead-platform spend by leads for cost per lead", () => {
    const blend = emptyTotals();
    addInto(blend, { ...t({ costMinor: 30000, clicks: 300, conversions: 20 }) }); // Google Ads: buys conversions, reports no leads
    addInto(blend, { ...t({ costMinor: 10000, clicks: 100, conversions: 10, leads: 10 }), leadsReported: true, leadCostMinor: undefined }); // Meta line
    const [cpl] = kpiValues(["costPerLead"], blend, null);
    expect(cpl.value).toBe(1000); // $100 of Meta spend ÷ 10 leads, not $400 ÷ 10
    // Re-adding totals (e.g. daily rows into a period) keeps lead-platform spend exact, even a day at $0.
    const day1 = addInto(emptyTotals(), { ...t({ costMinor: 10000 }), leadCostMinor: undefined });
    addInto(day1, { ...t({ costMinor: 0 }), leadsReported: true, leadCostMinor: undefined });
    const day2 = addInto(emptyTotals(), { ...t({ costMinor: 10000 }), leadCostMinor: undefined });
    addInto(day2, { ...t({ costMinor: 5000, leads: 5 }), leadsReported: true, leadCostMinor: undefined });
    const period = addInto(addInto(emptyTotals(), day1), day2);
    expect(kpiValues(["costPerLead"], period, null)[0].value).toBe(1000); // $50 ÷ 5 leads
    // Leads that cost nothing have no cost per lead.
    const free = addInto(emptyTotals(), { ...t({ costMinor: 30000 }), leadCostMinor: undefined });
    addInto(free, { ...t({ costMinor: 0, leads: 20 }), leadsReported: true, leadCostMinor: undefined });
    expect(kpiValues(["costPerLead"], free, null)[0].value).toBeNull();
  });

  it("knows which tiles a client doesn't track", () => {
    expect([...untrackedKpis(t({ conversions: 10 }))].sort()).toEqual(["conversionValue", "costPerLead", "leads", "roas"]);
    // The $1-per-conversion placeholder isn't a real value; reported zero leads count as not tracked.
    expect(untrackedKpis(t({ conversions: 10, conversionValueMinor: 1000, leadsReported: true })).has("roas")).toBe(true);
    expect(untrackedKpis(t({ conversions: 10, conversionValueMinor: 90_000, leads: 3 })).size).toBe(0);
    // Tracked in the comparison period is enough.
    expect(untrackedKpis(t({}), t({ leads: 2 })).has("leads")).toBe(false);
  });
});
