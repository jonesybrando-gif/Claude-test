import { describe, expect, it } from "vitest";
import { isWholeMonth, monthName, nextMonth, planCopyToNextMonth, planRollForward, previousMonth, type RolloverBudget } from "../budget-rollover";

const b = (over: Partial<RolloverBudget> & { id: string }): RolloverBudget => ({
  scope: "ACCOUNT",
  accountId: "acc1",
  campaignId: null,
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  repeatsMonthly: true,
  ...over,
});

/** Apply a plan as the server would: new budgets for the target month. */
const apply = (budgets: RolloverBudget[], plan: ReturnType<typeof planRollForward>) => [
  ...budgets,
  ...plan.map((p, i) => ({ ...p.source, id: `new${i}`, periodStart: p.periodStart, periodEnd: p.periodEnd })),
];

describe("month helpers", () => {
  it("recognises whole calendar months, including February and leap years", () => {
    expect(isWholeMonth("2026-10-01", "2026-10-31")).toBe(true);
    expect(isWholeMonth("2026-11-01", "2026-11-30")).toBe(true);
    expect(isWholeMonth("2026-02-01", "2026-02-28")).toBe(true);
    expect(isWholeMonth("2028-02-01", "2028-02-29")).toBe(true);
    expect(isWholeMonth("2028-02-01", "2028-02-28")).toBe(false);
    expect(isWholeMonth("2026-10-01", "2026-10-30")).toBe(false);
    expect(isWholeMonth("2026-10-15", "2026-11-14")).toBe(false);
  });

  it("finds next and previous months across year ends and short months", () => {
    expect(nextMonth("2026-10-26")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(nextMonth("2026-12-31")).toEqual({ start: "2027-01-01", end: "2027-01-31" });
    expect(nextMonth("2027-01-31")).toEqual({ start: "2027-02-01", end: "2027-02-28" });
    expect(previousMonth("2027-01-01")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(previousMonth("2028-03-01")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(monthName("2026-11-01")).toBe("November");
  });
});

describe("planRollForward", () => {
  it("creates this month's budget from last month's repeating budget", () => {
    const plan = planRollForward([b({ id: "oct" })], "2026-11-01");
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    expect(plan[0].source.id).toBe("oct");
  });

  it("rolls December into January and January into February", () => {
    expect(planRollForward([b({ id: "dec", periodStart: "2026-12-01", periodEnd: "2026-12-31" })], "2027-01-05")[0]).toMatchObject({ periodStart: "2027-01-01", periodEnd: "2027-01-31" });
    expect(planRollForward([b({ id: "jan", periodStart: "2027-01-01", periodEnd: "2027-01-31" })], "2027-02-10")[0]).toMatchObject({ periodStart: "2027-02-01", periodEnd: "2027-02-28" });
    expect(planRollForward([b({ id: "feb", periodStart: "2027-02-01", periodEnd: "2027-02-28" })], "2027-03-01")[0]).toMatchObject({ periodStart: "2027-03-01", periodEnd: "2027-03-31" });
  });

  it("skips non-repeating and non-whole-month budgets", () => {
    const budgets = [
      b({ id: "off", repeatsMonthly: false }),
      b({ id: "partial", accountId: "acc2", periodStart: "2026-10-01", periodEnd: "2026-10-15" }),
      b({ id: "midmonth", accountId: "acc3", periodStart: "2026-10-15", periodEnd: "2026-11-14" }),
    ];
    expect(planRollForward(budgets, "2026-11-02")).toEqual([]);
  });

  it("does nothing while still inside the source month", () => {
    expect(planRollForward([b({ id: "oct" })], "2026-10-26")).toEqual([]);
  });

  it("is idempotent: planning again after applying returns nothing", () => {
    const budgets = [b({ id: "a" }), b({ id: "c", scope: "CLIENT", accountId: null }), b({ id: "camp", scope: "CAMPAIGN", accountId: "acc1", campaignId: "cmp1" })];
    const first = planRollForward(budgets, "2026-11-01");
    expect(first).toHaveLength(3);
    expect(planRollForward(apply(budgets, first), "2026-11-01")).toEqual([]);
  });

  it("does not duplicate a target that already has a budget this month", () => {
    const budgets = [b({ id: "oct" }), b({ id: "nov", periodStart: "2026-11-01", periodEnd: "2026-11-30", repeatsMonthly: false })];
    expect(planRollForward(budgets, "2026-11-03")).toEqual([]);
  });

  it("skips copies that would clash with a custom-period budget already in the new month", () => {
    const budgets = [b({ id: "oct" }), b({ id: "custom", accountId: "acc2", periodStart: "2026-11-01", periodEnd: "2026-11-15", repeatsMonthly: false })];
    expect(planRollForward(budgets, "2026-11-03")).toEqual([]);
  });

  it("copies each target separately", () => {
    const budgets = [b({ id: "x" }), b({ id: "y", accountId: "acc2" }), b({ id: "z", accountId: "acc2", periodStart: "2026-11-01", periodEnd: "2026-11-30" })];
    expect(planRollForward(budgets, "2026-11-01").map((p) => p.source.id)).toEqual(["x"]);
  });
});

describe("planCopyToNextMonth", () => {
  it("copies this month's whole-month budgets, repeating or not", () => {
    const budgets = [b({ id: "r" }), b({ id: "once", accountId: "acc2", repeatsMonthly: false }), b({ id: "partial", accountId: "acc3", periodEnd: "2026-10-20" })];
    const plan = planCopyToNextMonth(budgets, "2026-10-26");
    expect(plan.map((p) => p.source.id).sort()).toEqual(["once", "r"]);
    expect(plan[0]).toMatchObject({ periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    expect(planCopyToNextMonth(apply(budgets, plan), "2026-10-26")).toEqual([]);
  });
});
