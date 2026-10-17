import { describe, expect, it } from "vitest";
import { validateNewBudget, validateRevision, type ExistingBudget } from "../budget-validation";
import { parseMoneyToMinor } from "../money";

const oct = { periodStart: "2026-10-01", periodEnd: "2026-10-31" };
const existing: ExistingBudget[] = [{ id: "b1", scope: "ACCOUNT", accountId: "a1", campaignId: null, ...oct }];

describe("validateNewBudget", () => {
  it("accepts a budget for another account in the same period", () => {
    expect(validateNewBudget({ scope: "ACCOUNT", accountId: "a2", campaignId: null, amountMinor: 500000, ...oct }, existing)).toEqual([]);
  });

  it("rejects a duplicate budget for the same account", () => {
    expect(validateNewBudget({ scope: "ACCOUNT", accountId: "a1", campaignId: null, amountMinor: 1, ...oct }, existing)).toHaveLength(1);
  });

  it("rejects overlapping budgets with a different period", () => {
    const errs = validateNewBudget({ scope: "ACCOUNT", accountId: "a2", campaignId: null, amountMinor: 1, periodStart: "2026-10-15", periodEnd: "2026-11-14" }, existing);
    expect(errs[0]).toContain("same period");
  });

  it("accepts the next month", () => {
    expect(validateNewBudget({ scope: "ACCOUNT", accountId: "a1", campaignId: null, amountMinor: 1, periodStart: "2026-11-01", periodEnd: "2026-11-30" }, existing)).toEqual([]);
  });

  it("validates scope targets and amounts", () => {
    expect(validateNewBudget({ scope: "ACCOUNT", accountId: null, campaignId: null, amountMinor: 1, ...oct }, [])).not.toEqual([]);
    expect(validateNewBudget({ scope: "CLIENT", accountId: "a1", campaignId: null, amountMinor: 1, ...oct }, [])).not.toEqual([]);
    expect(validateNewBudget({ scope: "CLIENT", accountId: null, campaignId: null, amountMinor: -5, ...oct }, [])).not.toEqual([]);
    expect(validateNewBudget({ scope: "CLIENT", accountId: null, campaignId: null, amountMinor: 1, periodStart: "2026-10-31", periodEnd: "2026-10-01" }, [])).not.toEqual([]);
  });
});

describe("validateRevision", () => {
  it("requires the effective date inside the period", () => {
    expect(validateRevision("2026-10-01", "2026-10-31", "2026-10-15", 100)).toEqual([]);
    expect(validateRevision("2026-10-01", "2026-10-31", "2026-11-01", 100)).toHaveLength(1);
  });
});

describe("parseMoneyToMinor", () => {
  it("parses dollar input exactly, without floating point", () => {
    expect(parseMoneyToMinor("5000")).toBe(500000);
    expect(parseMoneyToMinor("$5,000.5")).toBe(500050);
    expect(parseMoneyToMinor("0.29")).toBe(29); // 0.29*100 = 28.999… in floating point
    expect(() => parseMoneyToMinor("12.345")).toThrow();
    expect(() => parseMoneyToMinor("abc")).toThrow();
  });
});
