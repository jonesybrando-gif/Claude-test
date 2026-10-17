/**
 * Budget hierarchy resolution — decides which budgets are "pacing units" so
 * that budgets and spend are each counted exactly once when rolling up
 * campaign → account → client → agency.
 *
 * Rules for one client and one period:
 * 1. A CLIENT budget, if present, is the client's budget. It is paced against
 *    the spend of every account the client has.
 * 2. Otherwise, each account contributes its ACCOUNT budget if it has one
 *    (paced against all of that account's spend), else the sum of its
 *    CAMPAIGN budgets (each paced against that campaign's spend only).
 * 3. Account/campaign budgets beneath a CLIENT budget, and campaign budgets
 *    beneath an ACCOUNT budget, are sub-allocations: they are still paced on
 *    their own for drill-down, but are never added into the parent total.
 * 4. Spend from accounts/campaigns with no budget at any level is reported as
 *    unbudgeted spend instead of silently inflating a pacing figure.
 */

export type Scope = "CLIENT" | "ACCOUNT" | "CAMPAIGN";

export interface BudgetRef {
  id: string;
  scope: Scope;
  accountId: string | null;
  campaignId: string | null;
}

export interface CampaignRef {
  id: string;
  accountId: string;
}

export interface PacingUnit {
  budgetId: string;
  scope: Scope;
  /** Spend filter: every leaf performance row whose account/campaign matches. */
  accountIds: string[]; // for CLIENT and ACCOUNT units
  campaignIds: string[]; // for CAMPAIGN units
}

export interface HierarchyResolution {
  /** Units that make up the client total — never overlapping. */
  rollupUnits: PacingUnit[];
  /** Units paced for drill-down only (not added to totals). */
  subAllocationUnits: PacingUnit[];
  /** Accounts with no budget at any level. */
  unbudgetedAccountIds: string[];
  /** Campaigns not covered, inside accounts that only have campaign budgets. */
  unbudgetedCampaignIds: string[];
}

export function resolveBudgetHierarchy(
  accountIds: string[],
  campaigns: CampaignRef[],
  budgets: BudgetRef[],
): HierarchyResolution {
  const clientBudgets = budgets.filter((b) => b.scope === "CLIENT");
  if (clientBudgets.length > 1) throw new Error("A client can have only one CLIENT budget per period");

  const accountBudget = new Map<string, BudgetRef>();
  for (const b of budgets.filter((b) => b.scope === "ACCOUNT")) {
    if (!b.accountId) throw new Error(`ACCOUNT budget ${b.id} has no accountId`);
    if (accountBudget.has(b.accountId)) throw new Error(`Account ${b.accountId} has more than one budget for the period`);
    accountBudget.set(b.accountId, b);
  }
  const campaignBudget = new Map<string, BudgetRef>();
  for (const b of budgets.filter((b) => b.scope === "CAMPAIGN")) {
    if (!b.campaignId) throw new Error(`CAMPAIGN budget ${b.id} has no campaignId`);
    if (campaignBudget.has(b.campaignId)) throw new Error(`Campaign ${b.campaignId} has more than one budget for the period`);
    campaignBudget.set(b.campaignId, b);
  }

  const campaignAccount = new Map(campaigns.map((c) => [c.id, c.accountId]));
  const accountUnit = (b: BudgetRef): PacingUnit => ({ budgetId: b.id, scope: "ACCOUNT", accountIds: [b.accountId!], campaignIds: [] });
  const campaignUnit = (b: BudgetRef): PacingUnit => ({ budgetId: b.id, scope: "CAMPAIGN", accountIds: [], campaignIds: [b.campaignId!] });

  const rollupUnits: PacingUnit[] = [];
  const subAllocationUnits: PacingUnit[] = [];
  const unbudgetedAccountIds: string[] = [];
  const unbudgetedCampaignIds: string[] = [];

  if (clientBudgets.length === 1) {
    rollupUnits.push({ budgetId: clientBudgets[0].id, scope: "CLIENT", accountIds: [...accountIds], campaignIds: [] });
    for (const b of accountBudget.values()) subAllocationUnits.push(accountUnit(b));
    for (const b of campaignBudget.values()) subAllocationUnits.push(campaignUnit(b));
  } else {
    for (const accountId of accountIds) {
      const ab = accountBudget.get(accountId);
      const accountCampaignIds = campaigns.filter((c) => c.accountId === accountId).map((c) => c.id);
      const cbs = accountCampaignIds.map((id) => campaignBudget.get(id)).filter((b): b is BudgetRef => !!b);
      if (ab) {
        rollupUnits.push(accountUnit(ab));
        for (const b of cbs) subAllocationUnits.push(campaignUnit(b));
      } else if (cbs.length) {
        for (const b of cbs) rollupUnits.push(campaignUnit(b));
        for (const id of accountCampaignIds) if (!campaignBudget.has(id)) unbudgetedCampaignIds.push(id);
      } else {
        unbudgetedAccountIds.push(accountId);
      }
    }
  }

  for (const b of campaignBudget.values()) {
    const acc = campaignAccount.get(b.campaignId!);
    if (!acc || !accountIds.includes(acc)) throw new Error(`Campaign budget ${b.id} references a campaign outside this client`);
  }

  return { rollupUnits, subAllocationUnits, unbudgetedAccountIds, unbudgetedCampaignIds };
}

export interface SpendRow {
  accountId: string;
  campaignId: string | null;
  date: string;
  costMinor: number;
}

/** Sum leaf spend rows matching a unit into a date → minor-units map. */
export function spendForUnit(unit: PacingUnit, rows: SpendRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  const accounts = new Set(unit.accountIds);
  const campaigns = new Set(unit.campaignIds);
  for (const r of rows) {
    const match = unit.scope === "CAMPAIGN" ? r.campaignId !== null && campaigns.has(r.campaignId) : accounts.has(r.accountId);
    if (match) out[r.date] = (out[r.date] ?? 0) + r.costMinor;
  }
  return out;
}
