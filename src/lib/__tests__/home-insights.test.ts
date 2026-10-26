import { describe, expect, it } from "vitest";
import { homeInsights, type HomeInsightInput } from "../home-insights";

const p = (spendMinor: number, results: number) => ({ spendMinor, results });

const base: HomeInsightInput = {
  currency: "USD",
  totals: { current: p(10391400, 1949), previous: p(10873900, 2564) },
  clients: [
    { id: "bb", name: "Board and Brew", current: p(700000, 1199), previous: p(700000, 1763) },
    { id: "gi", name: "Graeme Industrial", current: p(477300, 14), previous: p(477300, 25) },
    { id: "js", name: "Junk South", current: p(304500, 65), previous: p(304500, 46) },
  ],
  budgets: [
    { id: "scmc", name: "SCMC", varianceMinor: -899700, off: true },
    { id: "vnisc", name: "VNISC", varianceMinor: -419700, off: true },
    { id: "kallos", name: "Kallos", varianceMinor: 37500, off: true },
    { id: "js", name: "Junk South", varianceMinor: -22500, off: false },
  ],
  previousLabel: "last month",
};

describe("homeInsights", () => {
  it("names the client behind most of a results change", () => {
    const [r] = homeInsights(base);
    expect(r.headline).toBe("Results down 24% this month");
    expect(r.detail).toBe("1,949 vs 2,564 at this point last month. Most of the drop is one client: Board and Brew (1,199 vs 1,763).");
    expect(r.action.href).toBe("/clients/bb");
  });

  it("explains a cost-per-result change by spend or results", () => {
    const cpr = homeInsights(base).find((x) => x.eyebrow === "Cost per result")!;
    expect(cpr.headline).toBe("Cost per result up 26%");
    expect(cpr.detail).toContain("Spend is about the same, so fewer results drove it.");
  });

  it("sums the largest budget misses in the bigger direction, ignoring small ones", () => {
    const b = homeInsights(base).find((x) => x.eyebrow === "Budgets")!;
    expect(b.headline).toBe("Review 2 large underspends");
    expect(b.detail).toBe("SCMC and VNISC are on track to leave about $13,194 unspent this month. Check the budgets are still right before raising spend.");
  });

  it("stays quiet when changes are small or samples too few", () => {
    const quiet = homeInsights({ ...base, totals: { current: p(100000, 9), previous: p(100000, 20) }, budgets: [] });
    expect(quiet).toEqual([]);
  });
});
