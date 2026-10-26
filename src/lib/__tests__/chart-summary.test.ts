import { describe, expect, it } from "vitest";
import { changePhrase, isAdditiveMetric, summarizeBreakdown, summarizeSeries } from "../chart-summary";

const usd = (v: number) => `$${v}`;

describe("isAdditiveMetric", () => {
  it("adds counts and spend, not rates", () => {
    expect(isAdditiveMetric("spend")).toBe(true);
    expect(isAdditiveMetric("ads.clicks")).toBe(true);
    expect(isAdditiveMetric("costPerLead")).toBe(false);
    expect(isAdditiveMetric("ads.ctr")).toBe(false);
    expect(isAdditiveMetric("facebook.engagementRate")).toBe(false);
    expect(isAdditiveMetric("nope.metric")).toBe(false);
  });
});

describe("changePhrase", () => {
  it("is neutral for small changes and small counts", () => {
    expect(changePhrase(103, 100)).toBe("about the same as the comparison period");
    expect(changePhrase(4, 2, { count: true })).toBe("too few to compare with the comparison period");
    expect(changePhrase(112, 100)).toBe("up 12% on the comparison period");
    expect(changePhrase(80, 100)).toBe("down 20% on the comparison period");
    expect(changePhrase(5, 0)).toBe("none in the comparison period");
  });
});

describe("summarizeSeries", () => {
  const dates = ["2026-09-01", "2026-09-02", "2026-09-03"];
  it("totals additive metrics and compares", () => {
    expect(summarizeSeries({ label: "Spend", dates, values: [10, 30, 20], previous: [10, 10, 30], additive: true, format: usd })).toBe(
      "Spend for the period: $60, up 20% on the comparison period. Highest on Sep 2 ($30) and lowest on Sep 1 ($10).",
    );
  });
  it("uses the exact period value when given", () => {
    expect(summarizeSeries({ label: "Cost per lead", dates, values: [5, 9, null], additive: false, period: { current: 7, previous: 7 }, format: usd })).toBe(
      "Cost per lead for the period: $7, about the same as the comparison period. Highest on Sep 2 ($9) and lowest on Sep 1 ($5).",
    );
  });
  it("describes non-additive metrics by high and low only", () => {
    expect(summarizeSeries({ label: "CTR", dates, values: [1, 3, 2], additive: false, format: (v) => `${v}%` })).toBe("CTR was highest on Sep 2 (3%) and lowest on Sep 1 (1%).");
  });
  it("handles no data", () => {
    expect(summarizeSeries({ label: "Leads", dates, values: [null, null, null], additive: true, format: usd })).toBe("Leads: no data for this period.");
  });
});

describe("summarizeBreakdown", () => {
  it("names the top two with share", () => {
    expect(summarizeBreakdown("Spend", [{ label: "Meta", value: 40 }, { label: "Google", value: 60 }], usd, { share: true })).toBe("Google had the highest spend: $60 (60% of the total), then Meta ($40).");
    expect(summarizeBreakdown("Spend", [], usd)).toBe("Spend: nothing to show for this period.");
  });
});
