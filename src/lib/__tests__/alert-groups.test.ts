import { describe, expect, it } from "vitest";
import { alertFixLink, displaySeverity, groupAlertsByCause, visibleAlerts, type GroupableAlert } from "../alert-groups";

let n = 0;
const al = (o: Partial<GroupableAlert> & { type: string }): GroupableAlert & { message: string } => ({ id: `a${++n}`, severity: "warning", clientId: "c1", accountId: null, message: `msg ${n}`, ...o });
const google = { id: "conn1", platform: "GOOGLE_ADS" as const, status: "NEEDS_REAUTH" };

describe("groupAlertsByCause", () => {
  it("groups disconnected accounts on one expired login into one issue", () => {
    const issues = groupAlertsByCause([1, 2, 3, 4, 5, 6].map((i) => al({ type: "ACCOUNT_DISCONNECTED", severity: "critical", clientId: `c${i}`, accountId: `acc${i}`, connection: google })));
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toBe("Google Ads login expired — 6 accounts not updating");
  });
  it("groups quiet campaigns and sorts critical issues first", () => {
    const issues = groupAlertsByCause([
      ...[1, 2, 3, 4].map(() => al({ type: "CAMPAIGN_NO_SPEND" })),
      al({ type: "OVERSPENDING", severity: "critical" }),
      al({ type: "UNDERSPENDING", severity: "critical" }),
    ]);
    expect(issues.map((i) => [i.title, i.severity])).toEqual([
      ["1 budget line overspending", "critical"],
      ["4 campaigns haven't spent in 3+ days", "warning"],
      ["1 budget line underspending", "warning"],
    ]);
  });
  it("underspending is never shown as critical", () => {
    expect(displaySeverity({ type: "UNDERSPENDING", severity: "critical" })).toBe("warning");
  });
});

describe("visibleAlerts", () => {
  it("hides underspend while the same account has stopped spending, and muted types", () => {
    const stopped = al({ type: "SPEND_STOPPED", severity: "critical", accountId: "acc1" });
    const under = al({ type: "UNDERSPENDING", details: { accountIds: ["acc1"] } });
    const otherUnder = al({ type: "UNDERSPENDING", details: { accountIds: ["acc2"] } });
    const spike = al({ type: "SPEND_SPIKE", clientId: "c2" });
    const out = visibleAlerts([stopped, under, otherUnder, spike], new Map([["c2", ["SPEND_SPIKE"]]]));
    expect(out.map((a) => a.id)).toEqual([stopped.id, otherUnder.id]);
  });
});

describe("alertFixLink", () => {
  it("points each type at the place to fix it", () => {
    expect(alertFixLink("SYNC_FAILED", "c1").href).toBe("/integrations");
    expect(alertFixLink("UNDERSPENDING", "c1").href).toBe("/clients/c1/budgets");
    expect(alertFixLink("CAMPAIGN_NO_SPEND", "c1").href).toBe("/clients/c1/campaigns");
  });
});
