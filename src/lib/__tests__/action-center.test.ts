import { describe, expect, it } from "vitest";
import { recommendAction, type ActionInput } from "../action-center";

const base: ActionInput = {
  status: "ON_TARGET",
  currency: "USD",
  budgetMinor: 500000,
  actualToDateMinor: 250000,
  projectedVarianceMinor: 0,
  requiredDailyMinor: 16667,
  currentDailyRateMinor: 16667,
  remainingActiveDays: 15,
  phase: "ACTIVE",
  stale: false,
  disconnected: false,
};

describe("recommendAction", () => {
  it("ABC Plumbing: reduce to ≈$120/day", () => {
    const a = recommendAction({
      ...base,
      status: "OVERSPENDING",
      actualToDateMinor: 320000,
      projectedVarianceMinor: 140000,
      requiredDailyMinor: 12000,
      currentDailyRateMinor: 21333,
    });
    expect(a.severity).toBe("critical");
    expect(a.headline).toBe("Projected to overspend by $1,400");
    expect(a.detail).toContain("to ≈$120 for the remaining 15 days");
  });

  it("Dental Group: increase to ≈$340/day", () => {
    const a = recommendAction({
      ...base,
      status: "UNDERSPENDING",
      budgetMinor: 800000,
      actualToDateMinor: 290000,
      projectedVarianceMinor: -220000,
      requiredDailyMinor: 34000,
      currentDailyRateMinor: 19333,
    });
    expect(a.headline).toBe("Projected to underspend by $2,200");
    expect(a.detail).toContain("to ≈$340 to reach the monthly budget");
  });

  it("On target: no action required", () => {
    expect(recommendAction(base)).toEqual({ severity: "ok", headline: "On target", detail: "No action required." });
  });

  it("flags stale and disconnected data", () => {
    expect(recommendAction({ ...base, stale: true }).detail).toContain("stale");
    expect(recommendAction({ ...base, disconnected: true }).severity).toBe("critical");
  });

  it("budget exhausted", () => {
    const a = recommendAction({ ...base, status: "OVERSPENDING", actualToDateMinor: 510000, requiredDailyMinor: 0 });
    expect(a.headline).toContain("Budget exhausted");
  });
});

describe("forecast-driven recommendations", () => {
  it("on plan so far but a mid-month increase will be missed → increase spend", () => {
    const a = recommendAction({
      ...base,
      status: "ON_TARGET",
      forecastStatus: "UNDERSPENDING",
      budgetMinor: 600000,
      actualToDateMinor: 209300,
      projectedVarianceMinor: -194500,
      requiredDailyMinor: 26000,
      currentDailyRateMinor: 13300,
    });
    expect(a.severity).toBe("critical");
    expect(a.headline).toBe("Projected to underspend by $1,945");
    expect(a.detail).toContain("current daily rate will not land on the budget");
  });

  it("a milder forecast does not override a worse pacing status", () => {
    const a = recommendAction({ ...base, status: "OVERSPENDING", forecastStatus: "SLIGHTLY_OVER", projectedVarianceMinor: 50000, requiredDailyMinor: 10000 });
    expect(a.severity).toBe("critical");
    expect(a.detail).not.toContain("current daily rate");
  });
});
