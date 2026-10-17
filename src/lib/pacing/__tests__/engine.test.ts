import { describe, expect, it } from "vitest";
import { computePacing, combinePacing, type PacingInput } from "../engine";
import { eachDay, todayInTimeZone, monthBounds } from "../dates";
import { classifyPacing } from "../status";

const usd = (dollars: number) => Math.round(dollars * 100);

/** Spread `total` evenly over the given dates (cents, remainder on last day). */
function evenSpend(dates: string[], total: number): Record<string, number> {
  const out: Record<string, number> = {};
  const per = Math.floor(total / dates.length);
  dates.forEach((d, i) => (out[d] = per + (i === dates.length - 1 ? total - per * dates.length : 0)));
  return out;
}

function base(overrides: Partial<PacingInput> = {}): PacingInput {
  return {
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    asOf: "2026-09-15",
    revisions: [{ effectiveDate: "2026-09-01", amountMinor: usd(5000) }],
    dailySpend: {},
    ...overrides,
  };
}

describe("basic calendar-month pacing", () => {
  it("matches the ABC Plumbing example exactly", () => {
    const r = computePacing(
      base({ dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(3200)) }),
    );
    expect(r.elapsedDays).toBe(15);
    expect(r.totalDays).toBe(30);
    expect(r.actualToDateMinor).toBe(usd(3200));
    expect(r.expectedToDateMinor).toBe(usd(2500));
    expect(r.pacingPct).toBeCloseTo(128, 10);
    expect(r.projectedMinor).toBe(usd(6400));
    expect(r.projectedVarianceMinor).toBe(usd(1400));
    expect(r.status).toBe("OVERSPENDING");
    expect(r.pctBudgetConsumed).toBeCloseTo(64, 10);
    expect(r.pctPeriodElapsed).toBeCloseTo(50, 10);
    // Daily Action Center: reduce to ~$120/day for the remaining 15 days
    expect(r.remainingDays).toBe(15);
    expect(r.requiredDailyMinor).toBe(usd(120));
    // trailing 7-day average; fixture puts the rounding remainder on the last day
    expect(Math.abs(r.currentDailyRateMinor - usd(3200) / 15)).toBeLessThanOrEqual(1);
    expect(r.recommendedDailyChangeMinor).toBeLessThan(0);
  });

  it("matches the Dental Group example (underspending)", () => {
    const r = computePacing(
      base({
        revisions: [{ effectiveDate: "2026-09-01", amountMinor: usd(8000) }],
        dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(2900)),
      }),
    );
    expect(r.pacingPct).toBeCloseTo(72.5, 10);
    expect(r.status).toBe("UNDERSPENDING");
    expect(r.requiredDailyMinor).toBe(usd(340));
    expect(r.projectedMinor).toBe(usd(5800));
  });

  it("is on target at exactly 100%", () => {
    const r = computePacing(
      base({ revisions: [{ effectiveDate: "2026-09-01", amountMinor: usd(4000) }], dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(2000)) }),
    );
    expect(r.pacingPct).toBeCloseTo(100, 10);
    expect(r.status).toBe("ON_TARGET");
    expect(r.projectedVarianceMinor).toBe(0);
  });

  it("ignores spend after asOf (partial today)", () => {
    const spend = evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(2500));
    spend["2026-09-16"] = usd(999); // partial, not yet complete
    const r = computePacing(base({ dailySpend: spend }));
    expect(r.actualToDateMinor).toBe(usd(2500));
    expect(r.pacingPct).toBeCloseTo(100, 10);
  });
});

describe("months of different lengths", () => {
  const cases: Array<[string, number]> = [
    ["2026-02-10", 28],
    ["2028-02-10", 29], // leap year
    ["2026-04-10", 30],
    ["2026-10-10", 31],
  ];
  it.each(cases)("%s → %i days", (asOf, days) => {
    const { start, end } = monthBounds(asOf);
    const r = computePacing({
      periodStart: start,
      periodEnd: end,
      asOf,
      revisions: [{ effectiveDate: start, amountMinor: usd(3100) }],
      dailySpend: evenSpend(eachDay(start, asOf), usd(1000)),
    });
    expect(r.totalDays).toBe(days);
    expect(r.elapsedDays).toBe(10);
    expect(r.expectedToDateMinor).toBe(Math.round((usd(3100) * 10) / days));
    expect(r.projectedMinor).toBe(Math.round((usd(1000) / 10) * days));
    // final planned point always lands exactly on budget
    expect(r.series.at(-1)!.plannedCumulative).toBe(usd(3100));
  });
});

describe("timezones", () => {
  it("resolves the local date per client timezone", () => {
    const instant = new Date("2026-10-01T03:30:00Z");
    expect(todayInTimeZone("America/Los_Angeles", instant)).toBe("2026-09-30");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-09-30");
    expect(todayInTimeZone("Europe/London", instant)).toBe("2026-10-01");
    expect(todayInTimeZone("Asia/Tokyo", instant)).toBe("2026-10-01");
  });

  it("handles DST transition months without drifting a day", () => {
    // US DST ends 2026-11-01; date math is calendar-based so 30 days remain 30.
    const r = computePacing({
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      asOf: "2026-11-15",
      revisions: [{ effectiveDate: "2026-11-01", amountMinor: usd(3000) }],
      dailySpend: {},
    });
    expect(r.totalDays).toBe(30);
    expect(r.elapsedDays).toBe(15);
  });
});

describe("mid-month budget changes", () => {
  it("re-allocates the remainder so the plan is continuous and ends on the new budget", () => {
    const r = computePacing(
      base({
        asOf: "2026-09-20",
        revisions: [
          { effectiveDate: "2026-09-01", amountMinor: usd(3000) },
          { effectiveDate: "2026-09-16", amountMinor: usd(6000) },
        ],
      }),
    );
    const at = (d: string) => r.series.find((p) => p.date === d)!;
    expect(at("2026-09-15").plannedCumulative).toBe(usd(1500)); // old plan: $100/day
    expect(at("2026-09-16").plannedDaily).toBe(usd(300)); // (6000-1500)/15
    expect(at("2026-09-30").plannedCumulative).toBe(usd(6000));
    expect(r.budgetMinor).toBe(usd(6000));
    expect(r.expectedToDateMinor).toBe(usd(1500 + 5 * 300));
  });

  it("budget cut below spend so far plans nothing further", () => {
    const r = computePacing(
      base({
        asOf: "2026-09-20",
        revisions: [
          { effectiveDate: "2026-09-01", amountMinor: usd(6000) },
          { effectiveDate: "2026-09-16", amountMinor: usd(2000) },
        ],
        dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-20"), usd(4000)),
      }),
    );
    expect(r.series.at(-1)!.plannedCumulative).toBe(usd(3000)); // plan already past new budget
    expect(r.remainingBudgetMinor).toBe(usd(-2000));
    expect(r.requiredDailyMinor).toBe(0);
    expect(r.status).toBe("OVERSPENDING");
  });
});

describe("zero-spend and edge cases", () => {
  it("zero spend mid-month is underspending with 0% pacing", () => {
    const r = computePacing(base());
    expect(r.pacingPct).toBe(0);
    expect(r.status).toBe("UNDERSPENDING");
    expect(r.projectedMinor).toBe(0);
    expect(r.requiredDailyMinor).toBe(Math.round(usd(5000) / 15));
    expect(r.recommendedDailyChangePct).toBeNull(); // no current rate to scale
  });

  it("zero budget and zero spend is NO_BUDGET", () => {
    const r = computePacing(base({ revisions: [{ effectiveDate: "2026-09-01", amountMinor: 0 }] }));
    expect(r.status).toBe("NO_BUDGET");
    expect(r.pacingPct).toBeNull();
    expect(r.pctBudgetConsumed).toBeNull();
  });

  it("zero budget with spend is overspending", () => {
    const r = computePacing(base({ revisions: [{ effectiveDate: "2026-09-01", amountMinor: 0 }], dailySpend: { "2026-09-03": 500 } }));
    expect(r.status).toBe("OVERSPENDING");
  });

  it("period not started", () => {
    const r = computePacing(base({ asOf: "2026-08-31" }));
    expect(r.phase).toBe("NOT_STARTED");
    expect(r.elapsedDays).toBe(0);
    expect(r.status).toBe("NOT_STARTED");
    expect(r.projectedMinor).toBe(usd(5000));
    expect(r.requiredDailyMinor).toBe(Math.round(usd(5000) / 30));
  });

  it("first day of month", () => {
    const r = computePacing(base({ asOf: "2026-09-01", dailySpend: { "2026-09-01": usd(200) } }));
    expect(r.elapsedDays).toBe(1);
    expect(r.pacingPct).toBeCloseTo(120, 10);
    expect(r.projectedMinor).toBe(usd(6000));
  });

  it("ended period clamps asOf and projection equals actual", () => {
    const r = computePacing(base({ asOf: "2026-10-05", dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-30"), usd(5100)) }));
    expect(r.phase).toBe("ENDED");
    expect(r.asOf).toBe("2026-09-30");
    expect(r.projectedMinor).toBe(usd(5100));
    expect(r.projectedVarianceMinor).toBe(usd(100));
    expect(r.recommendedDailyChangeMinor).toBeNull();
  });

  it("rejects non-integer money", () => {
    expect(() => computePacing(base({ revisions: [{ effectiveDate: "2026-09-01", amountMinor: 10.5 }] }))).toThrow();
  });
});

describe("distributions", () => {
  it("business-day pacing plans nothing on weekends", () => {
    // Sep 2026: 1st is a Tuesday; 22 weekdays.
    const r = computePacing(base({ distribution: { mode: "BUSINESS_DAYS" }, revisions: [{ effectiveDate: "2026-09-01", amountMinor: usd(2200) }] }));
    const sat = r.series.find((p) => p.date === "2026-09-05")!;
    expect(sat.plannedDaily).toBe(0);
    expect(r.series.find((p) => p.date === "2026-09-01")!.plannedDaily).toBe(usd(100));
    // Through Tue 15th: 11 weekdays
    expect(r.expectedToDateMinor).toBe(usd(1100));
    expect(r.remainingActiveDays).toBe(11);
  });

  it("weekend-weighted budgets give weekends more weight", () => {
    const r = computePacing(base({ distribution: { mode: "WEEKEND_WEIGHTED", weekendWeight: 2 } }));
    const sat = r.series.find((p) => p.date === "2026-09-05")!;
    const mon = r.series.find((p) => p.date === "2026-09-07")!;
    expect(sat.plannedDaily).toBe(mon.plannedDaily * 2);
    expect(r.series.at(-1)!.plannedCumulative).toBe(usd(5000));
  });

  it("custom daily (seasonal) weights", () => {
    const dailyWeights: Record<string, number> = {};
    for (const d of eachDay("2026-09-16", "2026-09-30")) dailyWeights[d] = 3;
    const r = computePacing(base({ distribution: { mode: "CUSTOM_DAILY", dailyWeights } }));
    // 15 days × 1 + 15 days × 3 = 60 weight; first half = 15/60 of budget
    expect(r.expectedToDateMinor).toBe(usd(1250));
  });

  it("temporary pauses remove planned spend and reduce active days", () => {
    const r = computePacing(base({ pauses: [{ start: "2026-09-20", end: "2026-09-24" }] }));
    expect(r.series.find((p) => p.date === "2026-09-22")!.plannedDaily).toBe(0);
    expect(r.remainingActiveDays).toBe(10);
    expect(r.series.at(-1)!.plannedCumulative).toBe(usd(5000));
  });

  it("spend only on zero-weight days falls back to calendar straight line", () => {
    const r = computePacing(base({ asOf: "2026-09-06", distribution: { mode: "BUSINESS_DAYS" }, periodStart: "2026-09-05", dailySpend: { "2026-09-05": usd(100) } }));
    expect(r.expectedToDateMinor).toBe(0);
    expect(r.status).toBe("OVERSPENDING");
    expect(r.projectedMinor).toBe(Math.round((usd(100) / 2) * 26));
  });
});

describe("forecast models", () => {
  it("trailing 7-day model reacts to recent acceleration", () => {
    const spend: Record<string, number> = {};
    for (const d of eachDay("2026-09-01", "2026-09-08")) spend[d] = usd(100);
    for (const d of eachDay("2026-09-09", "2026-09-15")) spend[d] = usd(300);
    const straight = computePacing(base({ dailySpend: spend }));
    const trailing = computePacing(base({ dailySpend: spend, forecastModel: "TRAILING_7_DAY" }));
    expect(straight.projectedMinor).toBe(Math.round(((usd(800) + usd(2100)) / 15) * 30));
    expect(trailing.projectedMinor).toBe(usd(2900) + usd(300) * 15);
    expect(trailing.series.at(-1)!.projectedCumulative).toBe(trailing.projectedMinor);
  });
});

describe("thresholds", () => {
  it("applies default boundaries", () => {
    expect(classifyPacing(84.99)).toBe("UNDERSPENDING");
    expect(classifyPacing(85)).toBe("SLIGHTLY_UNDER");
    expect(classifyPacing(94.99)).toBe("SLIGHTLY_UNDER");
    expect(classifyPacing(95)).toBe("ON_TARGET");
    expect(classifyPacing(105)).toBe("ON_TARGET");
    expect(classifyPacing(105.01)).toBe("SLIGHTLY_OVER");
    expect(classifyPacing(115)).toBe("SLIGHTLY_OVER");
    expect(classifyPacing(115.01)).toBe("OVERSPENDING");
  });

  it("respects custom thresholds", () => {
    const r = computePacing(
      base({
        thresholds: { under: 70, slightlyUnder: 90, slightlyOver: 130, over: 150 },
        dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(3200)),
      }),
    );
    expect(r.status).toBe("ON_TARGET");
  });
});

describe("combinePacing", () => {
  it("sums budgets, spend and series without double counting", () => {
    const a = computePacing(base({ dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(3200)) }));
    const b = computePacing(
      base({ revisions: [{ effectiveDate: "2026-09-01", amountMinor: usd(8000) }], dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(2900)) }),
    );
    const c = combinePacing([a, b])!;
    expect(c.budgetMinor).toBe(usd(13000));
    expect(c.actualToDateMinor).toBe(usd(6100));
    expect(c.expectedToDateMinor).toBe(usd(6500));
    expect(c.pacingPct).toBeCloseTo((6100 / 6500) * 100, 10);
    expect(c.status).toBe("SLIGHTLY_UNDER");
    expect(c.projectedMinor).toBe(usd(12200));
    expect(c.series.at(-1)!.plannedCumulative).toBe(usd(13000));
    expect(c.series.find((p) => p.date === "2026-09-15")!.actualCumulative).toBe(usd(6100));
  });
});

describe("forecast status", () => {
  it("flags a mid-month increase that current spend will not reach", () => {
    const r = computePacing(
      base({
        asOf: "2026-09-15",
        revisions: [
          { effectiveDate: "2026-09-01", amountMinor: usd(3000) },
          { effectiveDate: "2026-09-16", amountMinor: usd(6000) },
        ],
        dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(1500)),
      }),
    );
    expect(r.status).toBe("ON_TARGET"); // on plan so far
    expect(r.projectedMinor).toBe(usd(3000));
    expect(r.forecastPct).toBeCloseTo(50, 10);
    expect(r.forecastStatus).toBe("UNDERSPENDING");
    expect(r.requiredDailyMinor).toBe(usd(300));
  });

  it("matches status for a steady account", () => {
    const r = computePacing(base({ dailySpend: evenSpend(eachDay("2026-09-01", "2026-09-15"), usd(3200)) }));
    expect(r.forecastPct).toBeCloseTo(128, 10);
    expect(r.forecastStatus).toBe("OVERSPENDING");
  });
});
