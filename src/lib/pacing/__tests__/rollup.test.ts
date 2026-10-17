import { describe, expect, it } from "vitest";
import { resolveBudgetHierarchy, spendForUnit, type BudgetRef, type SpendRow } from "../rollup";

const accounts = ["accG", "accM"];
const campaigns = [
  { id: "g1", accountId: "accG" },
  { id: "g2", accountId: "accG" },
  { id: "m1", accountId: "accM" },
];
const rows: SpendRow[] = [
  { accountId: "accG", campaignId: "g1", date: "2026-09-01", costMinor: 1000 },
  { accountId: "accG", campaignId: "g2", date: "2026-09-01", costMinor: 500 },
  { accountId: "accM", campaignId: "m1", date: "2026-09-01", costMinor: 700 },
  { accountId: "accM", campaignId: "m1", date: "2026-09-02", costMinor: 300 },
];

const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

describe("resolveBudgetHierarchy", () => {
  it("client budget wins; account and campaign budgets become sub-allocations", () => {
    const budgets: BudgetRef[] = [
      { id: "bc", scope: "CLIENT", accountId: null, campaignId: null },
      { id: "bg", scope: "ACCOUNT", accountId: "accG", campaignId: null },
      { id: "b1", scope: "CAMPAIGN", accountId: "accG", campaignId: "g1" },
    ];
    const r = resolveBudgetHierarchy(accounts, campaigns, budgets);
    expect(r.rollupUnits.map((u) => u.budgetId)).toEqual(["bc"]);
    expect(r.subAllocationUnits.map((u) => u.budgetId).sort()).toEqual(["b1", "bg"]);
    expect(total(spendForUnit(r.rollupUnits[0], rows))).toBe(2500); // every row exactly once
  });

  it("account budgets roll up; campaign budgets beneath them are not added", () => {
    const budgets: BudgetRef[] = [
      { id: "bg", scope: "ACCOUNT", accountId: "accG", campaignId: null },
      { id: "bm", scope: "ACCOUNT", accountId: "accM", campaignId: null },
      { id: "b1", scope: "CAMPAIGN", accountId: "accG", campaignId: "g1" },
    ];
    const r = resolveBudgetHierarchy(accounts, campaigns, budgets);
    expect(r.rollupUnits.map((u) => u.budgetId)).toEqual(["bg", "bm"]);
    expect(r.subAllocationUnits.map((u) => u.budgetId)).toEqual(["b1"]);
    const rolled = r.rollupUnits.reduce((s, u) => s + total(spendForUnit(u, rows)), 0);
    expect(rolled).toBe(2500);
  });

  it("campaign-only budgets roll up and uncovered campaigns are flagged", () => {
    const budgets: BudgetRef[] = [{ id: "b1", scope: "CAMPAIGN", accountId: "accG", campaignId: "g1" }];
    const r = resolveBudgetHierarchy(accounts, campaigns, budgets);
    expect(r.rollupUnits.map((u) => u.budgetId)).toEqual(["b1"]);
    expect(r.unbudgetedCampaignIds).toEqual(["g2"]);
    expect(r.unbudgetedAccountIds).toEqual(["accM"]);
    expect(total(spendForUnit(r.rollupUnits[0], rows))).toBe(1000);
  });

  it("rejects duplicate budgets for the same scope", () => {
    expect(() =>
      resolveBudgetHierarchy(accounts, campaigns, [
        { id: "a", scope: "ACCOUNT", accountId: "accG", campaignId: null },
        { id: "b", scope: "ACCOUNT", accountId: "accG", campaignId: null },
      ]),
    ).toThrow();
  });

  it("rejects campaign budgets for another client's campaign", () => {
    expect(() =>
      resolveBudgetHierarchy(accounts, campaigns, [{ id: "x", scope: "CAMPAIGN", accountId: "other", campaignId: "zz" }]),
    ).toThrow();
  });

  it("account-level rows (no campaign, e.g. LSA) count for account units", () => {
    const lsaRows: SpendRow[] = [{ accountId: "accL", campaignId: null, date: "2026-09-01", costMinor: 900 }];
    const r = resolveBudgetHierarchy(["accL"], [], [{ id: "bl", scope: "ACCOUNT", accountId: "accL", campaignId: null }]);
    expect(total(spendForUnit(r.rollupUnits[0], lsaRows))).toBe(900);
  });
});
