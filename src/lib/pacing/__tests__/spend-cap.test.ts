import { describe, expect, it } from "vitest";
import { computePacing } from "../engine";
import { eachDay } from "../dates";
import { googleAdsSpendCap } from "../spend-cap";

const usd = (dollars: number) => Math.round(dollars * 100);
const ads = { platform: "GOOGLE_ADS", monitored: true };
const lsa = { platform: "GOOGLE_LSA", monitored: true };
const enabled = (daily: number | null) => ({ status: "ENABLED", platformDailyBudgetMinor: daily === null ? null : usd(daily) });

describe("googleAdsSpendCap", () => {
  it("is 30.4 x the enabled campaigns' daily budgets for a calendar month", () => {
    // Dr. Shouhed, Nov 2026: MALS $394.74 + Gallbladder $82.24 = $476.98/day
    expect(googleAdsSpendCap("2026-11-01", "2026-11-30", [ads], [enabled(394.74), enabled(82.24)])).toBe(usd(14500.19));
  });

  it("ignores paused campaigns", () => {
    expect(googleAdsSpendCap("2026-11-01", "2026-11-30", [ads], [enabled(100), { status: "PAUSED", platformDailyBudgetMinor: usd(500) }])).toBe(usd(3040));
  });

  it("is unknown when an enabled campaign has no daily budget", () => {
    expect(googleAdsSpendCap("2026-11-01", "2026-11-30", [ads], [enabled(100), enabled(null)])).toBeUndefined();
  });

  it("is unknown when the line includes LSA or another platform", () => {
    expect(googleAdsSpendCap("2026-11-01", "2026-11-30", [ads, lsa], [enabled(100)])).toBeUndefined();
  });

  it("ignores retired accounts when deciding the platform mix", () => {
    expect(googleAdsSpendCap("2026-11-01", "2026-11-30", [ads, { ...lsa, monitored: false }], [enabled(100)])).toBe(usd(3040));
  });

  it("is unknown for a period that is not one whole calendar month", () => {
    expect(googleAdsSpendCap("2026-10-13", "2026-11-12", [ads], [enabled(100)])).toBeUndefined();
    expect(googleAdsSpendCap("2026-11-01", "2026-11-15", [ads], [enabled(100)])).toBeUndefined();
  });
});

describe("computePacing with a platform spend cap", () => {
  // Shouhed-like: $14,500 budget, over-delivering early in the month at ~$518/day.
  const input = {
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    asOf: "2026-11-04",
    revisions: [{ effectiveDate: "2026-11-01", amountMinor: usd(14500) }],
    dailySpend: Object.fromEntries(eachDay("2026-11-01", "2026-11-04").map((d) => [d, usd(518)])),
  };

  it("projects a straight-line overspend without a cap", () => {
    expect(computePacing(input).projectedMinor).toBe(usd(518 * 30));
  });

  it("never projects above what the platform can bill", () => {
    const r = computePacing({ ...input, spendCapMinor: usd(14500) });
    expect(r.projectedMinor).toBe(usd(14500));
    expect(r.projectedVarianceMinor).toBe(0);
    expect(r.forecastStatus).not.toBe("OVERSPENDING");
    // The chart's projected line ends where the forecast does.
    expect(r.series[r.series.length - 1].projectedCumulative).toBe(usd(14500));
  });

  it("does not raise an underspend forecast to the cap", () => {
    const low = { ...input, dailySpend: Object.fromEntries(eachDay("2026-11-01", "2026-11-04").map((d) => [d, usd(100)])) };
    expect(computePacing({ ...low, spendCapMinor: usd(14500) }).projectedMinor).toBe(usd(3000));
  });

  it("never projects below what is already spent", () => {
    const r = computePacing({ ...input, spendCapMinor: usd(1000) });
    expect(r.projectedMinor).toBe(usd(518 * 4));
  });
});
