import { describe, expect, it } from "vitest";
import { attentionReasons, attentionTier, costPerResultHigh, forecastSplit, describeChange, forecastOffBudget, medianCostPerResult, resultCount, type AttentionInput, type ClientResults } from "../portfolio";

const usd = (n: number) => `$${n / 100}`;

describe("resultCount", () => {
  it("counts each result once per platform", () => {
    expect(resultCount("META_ADS", { conversions: 12, leads: 12 })).toBe(12); // Meta leads are inside conversions
    expect(resultCount("GOOGLE_LSA", { conversions: 4, leads: 9 })).toBe(9); // charged leads are a subset of leads
    expect(resultCount("GOOGLE_ADS", { conversions: 7, leads: 0 })).toBe(7);
  });
});

describe("describeChange", () => {
  it("says the change in words with a verdict", () => {
    expect(describeChange({ current: 4224, previous: 4800, better: "down", format: usd, counts: { current: 20, previous: 20 } }).text).toBe("Down 12% from $48, better");
    expect(describeChange({ current: 130, previous: 100, better: "up", format: String }).text).toBe("Up 30% from 100, better");
  });
  it("spend gets no verdict", () => {
    const c = describeChange({ current: 108000, previous: 100000, better: "neutral", format: usd });
    expect(c.text).toBe("Up 8% from $1000");
    expect(c.verdict).toBe("neutral");
  });
  it("is neutral under 5% and with too few results", () => {
    expect(describeChange({ current: 104, previous: 100, better: "up", format: String }).text).toBe("About the same as 100");
    expect(describeChange({ current: 9, previous: 3, better: "up", format: String, counts: { current: 9, previous: 3 } }).verdict).toBe("too_few");
  });
  it("has nothing to compare with no earlier figure", () => {
    expect(describeChange({ current: 10, previous: 0, better: "up", format: String }).verdict).toBe("none");
  });
});

const cr = (cur: [number, number], prev: [number, number], id = "c1", currency = "USD"): ClientResults => ({ clientId: id, currency, current: { spendMinor: cur[0], results: cur[1] }, previous: { spendMinor: prev[0], results: prev[1] } });

describe("efficiency", () => {
  it("high when ≥1.3× its previous period or the agency median, with ≥10 results", () => {
    const m = medianCostPerResult([cr([1000, 10], [0, 0], "a"), cr([2000, 10], [0, 0], "b"), cr([3000, 10], [0, 0], "c")]);
    expect(m.get("USD")).toBe(200);
    expect(costPerResultHigh(cr([2600, 10], [0, 0]), m)).toBe(true); // 260 ≥ 1.3 × 200
    expect(costPerResultHigh(cr([2500, 10], [0, 0]), m)).toBe(false);
    expect(costPerResultHigh(cr([1500, 10], [1000, 10]), new Map())).toBe(true); // 150 vs 100 before
    expect(costPerResultHigh(cr([1500, 9], [1000, 10]), m)).toBe(false); // too few results
  });
  it("no median from fewer than 3 clients", () => {
    expect(medianCostPerResult([cr([1000, 10], [0, 0])]).size).toBe(0);
  });
});

describe("attentionReasons", () => {
  const base: AttentionInput = { currency: "USD", openCriticalAlerts: 0, lines: [], results: null, oldestSyncHours: 2, disconnected: false };
  it("all clear by default", () => {
    expect(attentionReasons(base)).toEqual([]);
  });
  it("forecast off budget by more than max($100, 5%)", () => {
    expect(forecastOffBudget(100000, 9000)).toBe(false);
    expect(forecastOffBudget(100000, -10001)).toBe(true);
    expect(forecastOffBudget(1000000, 40000)).toBe(false);
    const r = attentionReasons({ ...base, lines: [{ phase: "ACTIVE", budgetMinor: 500000, projectedVarianceMinor: 124900, currency: "USD" }, { phase: "ACTIVE", budgetMinor: 500000, projectedVarianceMinor: -60000, currency: "USD" }] });
    expect(r.map((x) => x.label)).toEqual(["Forecast $1,249 over budget", "Forecast $600 under budget"]);
  });
  it("cost per result up ≥20% and results down ≥30% need ≥10 results", () => {
    expect(attentionReasons({ ...base, results: cr([60000, 20], [50000, 25]) }).map((x) => x.kind)).toEqual(["cpr_up"]); // 3000 vs 2000 per result
    expect(attentionReasons({ ...base, results: cr([20000, 10], [50000, 20]) }).map((x) => x.kind)).toEqual(["results_down"]);
    expect(attentionReasons({ ...base, results: cr([60000, 5], [50000, 9]) })).toEqual([]);
  });
  it("orders disconnected and critical alerts first; stale over 36 hours", () => {
    const r = attentionReasons({ ...base, disconnected: true, openCriticalAlerts: 2, oldestSyncHours: 50 });
    expect(r.map((x) => x.label)).toEqual(["Ad account disconnected", "2 critical alerts"]);
    expect(attentionReasons({ ...base, oldestSyncHours: 50 })[0].label).toBe("Data 50 hours old");
  });
  it("other alerts count only when nothing else explains them, as Watch", () => {
    expect(attentionReasons({ ...base, openOtherAlerts: 1 })).toEqual([{ kind: "alerts", label: "1 open alert", tone: "warning" }]);
    const under = { phase: "ACTIVE" as const, budgetMinor: 500000, projectedVarianceMinor: -60000, currency: "USD" };
    expect(attentionReasons({ ...base, openOtherAlerts: 1, lines: [under] }).map((x) => x.kind)).toEqual(["under"]);
  });
});

describe("attentionTier", () => {
  const base: AttentionInput = { currency: "USD", openCriticalAlerts: 0, lines: [], results: null, oldestSyncHours: 2, disconnected: false };
  it("is Critical for a lost connection, critical alerts or a forecast over budget", () => {
    expect(attentionTier(attentionReasons({ ...base, disconnected: true }))).toBe("critical");
    expect(attentionTier(attentionReasons({ ...base, openCriticalAlerts: 1 }))).toBe("critical");
    expect(attentionTier(attentionReasons({ ...base, lines: [{ phase: "ACTIVE", budgetMinor: 500000, projectedVarianceMinor: 60000, currency: "USD" }] }))).toBe("critical");
  });
  it("is Watch for underspend, performance drops and old data; null when clear", () => {
    expect(attentionTier(attentionReasons({ ...base, lines: [{ phase: "ACTIVE", budgetMinor: 500000, projectedVarianceMinor: -60000, currency: "USD" }] }))).toBe("watch");
    expect(attentionTier(attentionReasons({ ...base, oldestSyncHours: 50 }))).toBe("watch");
    expect(attentionTier(attentionReasons({ ...base, openOtherAlerts: 2 }))).toBe("watch");
    expect(attentionTier([])).toBeNull();
  });
});

describe("forecastSplit", () => {
  it("keeps over and under apart instead of netting them, per currency", () => {
    const s = forecastSplit(
      [
        { currency: "USD", shownStatus: "OVERSPENDING", projectedVarianceMinor: 400000 },
        { currency: "USD", shownStatus: "UNDERSPENDING", projectedVarianceMinor: -400000 },
        { currency: "USD", shownStatus: "SLIGHTLY_UNDER", projectedVarianceMinor: -10000 },
        { currency: "USD", shownStatus: "ON_TARGET", projectedVarianceMinor: 500 },
        { currency: "CAD", shownStatus: "OVERSPENDING", projectedVarianceMinor: 99999 },
      ],
      "USD",
    );
    expect(s).toEqual({ currency: "USD", overMinor: 400000, overLines: 1, underMinor: 410000, underLines: 2, netMinor: -9500, otherCurrencies: ["CAD"] });
  });
});
