import { describe, expect, it } from "vitest";
import { formatKpi, kpiValues, KPIS } from "../kpis";
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
  });
});
