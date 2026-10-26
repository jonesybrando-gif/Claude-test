import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_SETTINGS, evaluateAlerts, resolveAlertSettings, validateAlertSettings, type AccountInput, type CampaignInput, type PacingRowInput } from "../alerts";
import { addDays, eachDay } from "../pacing/dates";

const NOW = new Date("2026-10-17T15:00:00Z");
const D = "2026-10-16"; // last complete day

function daily(from: string, to: string, amount: number, overrides: Record<string, number> = {}) {
  const out: Record<string, number> = {};
  for (const d of eachDay(from, to)) out[d] = amount;
  return { ...out, ...overrides };
}

const account = (o: Partial<AccountInput> = {}): AccountInput => ({
  id: "acc1",
  name: "ABC – Google",
  clientId: "c1",
  clientName: "ABC Plumbing",
  currency: "USD",
  isDemo: false,
  monitored: true,
  status: "ACTIVE",
  lastSuccessfulSyncAt: new Date(NOW.getTime() - 3600_000),
  lastSyncFailed: null,
  dataCompleteThrough: D,
  daily: daily("2026-09-20", D, 10000),
  ...o,
});

const row = (o: Partial<PacingRowInput["result"]> = {}, extra: Partial<PacingRowInput> = {}): PacingRowInput => ({
  key: "b1",
  clientId: "c1",
  clientName: "ABC Plumbing",
  label: "ABC – Google",
  currency: "USD",
  isDemo: false,
  action: { headline: "Projected to overspend by $1,249", detail: "Reduce average daily spend…" },
  result: { phase: "ACTIVE", periodStart: "2026-10-01", status: "ON_TARGET", forecastStatus: "ON_TARGET", budgetMinor: 500000, projectedVarianceMinor: 0, ...o },
  ...extra,
});

const run = (rows: PacingRowInput[] = [], accounts: AccountInput[] = [], campaigns: CampaignInput[] = [], settings = DEFAULT_ALERT_SETTINGS) =>
  evaluateAlerts({ rows, accounts, campaigns, settings, now: NOW });

describe("pacing alerts", () => {
  it("raises overspending and underspending as critical, keyed by budget period", () => {
    const a = run([row({ status: "OVERSPENDING", projectedVarianceMinor: 124900 })]);
    expect(a.map((x) => [x.kind, x.severity, x.dedupeKey])).toEqual([["OVERSPENDING", "critical", "PACING_OVER:b1:2026-10-01"]]);
    expect(run([row({ status: "UNDERSPENDING", projectedVarianceMinor: -100000 })])[0].dedupeKey).toBe("PACING_UNDER:b1:2026-10-01");
  });

  it("does not alert on slight deviations or on target", () => {
    expect(run([row({ status: "SLIGHTLY_OVER", projectedVarianceMinor: 10000 })])).toEqual([]); // 2% < 5% overrun threshold
    expect(run([row()])).toEqual([]);
  });

  it("raises a projected overrun beyond the threshold when pacing isn't already overspending", () => {
    const a = run([row({ status: "SLIGHTLY_OVER", projectedVarianceMinor: 40000 })]); // 8%
    expect(a.map((x) => x.kind)).toEqual(["PROJECTED_OVERRUN"]);
    expect(a[0].title).toContain("$400");
  });

  it("warns when a forecast will miss the budget though pacing to date is fine", () => {
    const a = run([row({ status: "ON_TARGET", forecastStatus: "UNDERSPENDING", projectedVarianceMinor: -100000 })]);
    expect(a.map((x) => [x.kind, x.severity])).toEqual([["UNDERSPENDING", "warning"]]);
  });

  it("ignores ended or unbudgeted lines", () => {
    expect(run([row({ phase: "ENDED", status: "OVERSPENDING" })])).toEqual([]);
    expect(run([{ ...row(), result: null }])).toEqual([]);
  });
});

describe("account alerts", () => {
  it("a healthy account raises nothing", () => {
    expect(run([], [account()])).toEqual([]);
  });

  it("detects a spend spike on the last complete day", () => {
    const a = run([], [account({ daily: daily("2026-09-20", D, 10000, { [D]: 25000 }) })]);
    expect(a.map((x) => [x.kind, x.dedupeKey])).toEqual([["SPEND_SPIKE", `SPEND_SPIKE:acc1:${D}`]]);
    expect(a[0].detail).toContain("2.5×");
  });

  it("ignores spikes on tiny accounts", () => {
    expect(run([], [account({ daily: daily("2026-09-20", D, 500, { [D]: 5000 }) })])).toEqual([]);
  });

  it("detects spend stopping and suppresses per-campaign duplicates", () => {
    const d = daily("2026-09-20", D, 10000, { [D]: 0, [addDays(D, -1)]: 0 });
    const campaigns: CampaignInput[] = [{ id: "cmp1", name: "Search", accountId: "acc1", status: "ENABLED", daily: d }];
    const a = run([], [account({ daily: d })], campaigns);
    expect(a.map((x) => x.kind)).toEqual(["SPEND_STOPPED"]);
    expect(a[0].dedupeKey).toBe("SPEND_STOPPED:acc1");
  });

  it("does not call one quiet day 'stopped'", () => {
    expect(run([], [account({ daily: daily("2026-09-20", D, 10000, { [D]: 0 }) })]).map((x) => x.kind)).toEqual([]);
  });

  it("flags an enabled campaign that went quiet while the account still spends", () => {
    const quiet = daily("2026-09-20", D, 3000, { [D]: 0, [addDays(D, -1)]: 0, [addDays(D, -2)]: 0 });
    const campaigns: CampaignInput[] = [
      { id: "cmp1", name: "Search – Brand", accountId: "acc1", status: "ENABLED", daily: quiet },
      { id: "cmp2", name: "Paused one", accountId: "acc1", status: "PAUSED", daily: quiet },
      { id: "cmp3", name: "Never spent", accountId: "acc1", status: "ENABLED", daily: {} },
    ];
    const a = run([], [account()], campaigns);
    expect(a.map((x) => [x.kind, x.dedupeKey])).toEqual([["CAMPAIGN_NO_SPEND", "CAMPAIGN_NO_SPEND:cmp1"]]);
  });

  it("reports disconnected accounts once, without sync or spend duplicates", () => {
    const a = run([], [account({ status: "NEEDS_REAUTH", lastSuccessfulSyncAt: new Date(NOW.getTime() - 50 * 3600_000), daily: {} })]);
    expect(a.map((x) => [x.kind, x.severity])).toEqual([["ACCOUNT_DISCONNECTED", "critical"]]);
  });

  it("reports failed and stale syncs", () => {
    expect(run([], [account({ lastSyncFailed: { at: NOW, error: "RATE_LIMITED: slow down" } })])[0]).toMatchObject({ kind: "SYNC_FAILED", detail: "RATE_LIMITED: slow down" });
    expect(run([], [account({ lastSuccessfulSyncAt: new Date(NOW.getTime() - 30 * 3600_000) })])[0].title).toContain("Data not updated");
    expect(run([], [account({ lastSuccessfulSyncAt: null })])[0].detail).toContain("never synced");
  });

  it("skips accounts the agency stopped monitoring", () => {
    expect(run([], [account({ monitored: false, status: "DISCONNECTED" })])).toEqual([]);
  });
});

describe("alert settings", () => {
  it("fills defaults and validates ranges", () => {
    expect(resolveAlertSettings({ spikeMultiplier: "3", junk: 1 }).spikeMultiplier).toBe(3);
    expect(resolveAlertSettings(null)).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(validateAlertSettings(DEFAULT_ALERT_SETTINGS)).toEqual([]);
    expect(validateAlertSettings({ ...DEFAULT_ALERT_SETTINGS, spikeMultiplier: 1, stoppedDays: 0.5 })).toHaveLength(2);
  });
});

describe("disconnected lines", () => {
  it("skip pacing alerts (the account alert covers them)", () => {
    expect(run([row({ status: "UNDERSPENDING" }, { disconnected: true })])).toEqual([]);
  });
});

describe("not-connected lines", () => {
  it("raise no pacing alerts (there is no data to pace)", () => {
    expect(run([row({ status: "UNDERSPENDING" }, { notConnected: true })])).toEqual([]);
  });
});

describe("alert titles", () => {
  it("all read \"<what happened> · <line, account or campaign>\"", () => {
    const titles = [
      ...run([row({ status: "UNDERSPENDING", projectedVarianceMinor: -100000 })]).map((a) => a.title),
      ...run([], [account({ status: "DISCONNECTED" })]).map((a) => a.title),
      ...run([], [account({ lastSuccessfulSyncAt: new Date(NOW.getTime() - 30 * 3600_000) })]).map((a) => a.title),
    ];
    expect(titles.length).toBeGreaterThan(2);
    for (const t of titles) expect(t).toMatch(/^[A-Z][^·]* · .+$/);
  });
});

describe("pacing alerts don't flap (H4)", () => {
  it("over and projected-overrun share one key per line, so a change updates the same alert", () => {
    const over = run([row({ status: "OVERSPENDING", projectedVarianceMinor: 124900 })])[0];
    const proj = run([row({ status: "SLIGHTLY_OVER", projectedVarianceMinor: 40000 })])[0];
    expect(over.dedupeKey).toBe(proj.dedupeKey);
  });
  it("waits for 3 complete days of data", () => {
    expect(run([row({ status: "OVERSPENDING", projectedVarianceMinor: 124900, elapsedDays: 2 })])).toEqual([]);
    expect(run([row({ status: "OVERSPENDING", projectedVarianceMinor: 124900, elapsedDays: 3 })])).toHaveLength(1);
  });
  it("ignores forecasts within max($100, 5% of budget)", () => {
    // $5,000 budget: 5% = $250
    expect(run([row({ status: "UNDERSPENDING", projectedVarianceMinor: -24000 })])).toEqual([]);
    // $1,000 budget: $100 floor
    expect(run([row({ status: "UNDERSPENDING", budgetMinor: 100000, projectedVarianceMinor: -9000 })])).toEqual([]);
    expect(run([row({ status: "UNDERSPENDING", budgetMinor: 100000, projectedVarianceMinor: -11000 })])).toHaveLength(1);
  });
  it("suppresses underspend while the line's account has stopped spending", () => {
    const stoppedAcc = account({ daily: daily("2026-09-20", D, 10000, { "2026-10-15": 0, "2026-10-16": 0 }) });
    const under = row({ status: "UNDERSPENDING", projectedVarianceMinor: -100000 }, { accountIds: ["acc1"] });
    const kinds = run([under], [stoppedAcc]).map((a) => a.kind);
    expect(kinds).toContain("SPEND_STOPPED");
    expect(kinds).not.toContain("UNDERSPENDING");
    // a line on another account still alerts
    expect(run([{ ...under, accountIds: ["acc2"] }], [stoppedAcc]).map((a) => a.kind)).toContain("UNDERSPENDING");
  });
});

describe("muted alert types", () => {
  it("are never raised for that client", () => {
    const over = row({ status: "OVERSPENDING", projectedVarianceMinor: 124900 });
    expect(evaluateAlerts({ rows: [over], accounts: [], campaigns: [], settings: DEFAULT_ALERT_SETTINGS, now: NOW, muted: { c1: ["OVERSPENDING"] } })).toEqual([]);
    expect(evaluateAlerts({ rows: [over], accounts: [], campaigns: [], settings: DEFAULT_ALERT_SETTINGS, now: NOW, muted: { c2: ["OVERSPENDING"] } })).toHaveLength(1);
  });
});

describe("performance alerts", () => {
  // Spend $100/day throughout; results per day vary by test.
  const perf = (prevPerDay: number, curPerDay: number, o: Partial<AccountInput> = {}) =>
    // Windows end 3 days before the last complete day (late-counted results), so the switch is on Oct 7.
    account({ dailyResults: { ...daily("2026-09-20", "2026-10-06", prevPerDay), ...daily("2026-10-07", D, curPerDay) }, ...o });
  const kinds = (a: AccountInput, settings = DEFAULT_ALERT_SETTINGS) => run([], [a], [], settings).map((x) => x.kind);

  it("raises a cost-per-result spike when each result costs ≥40% more with ≥10 results in both weeks", () => {
    // 3/day before (21/week) → 2/day now (14/week): cost per result +50%
    const a = run([], [perf(3, 2)]);
    expect(a.map((x) => x.kind)).toEqual(["CPA_SPIKE"]);
    expect(a[0].dedupeKey).toBe("CPA_SPIKE:c1");
    expect(a[0].title).toMatch(/^Cost per result up 50% · last 7 days$/);
  });
  it("needs at least 10 results in each week", () => {
    expect(kinds(perf(1, 0.6))).toEqual([]); // 7 vs 4.2 results
  });
  it("raises a results drop of ≥40% when the earlier week had ≥20", () => {
    expect(kinds(perf(4, 2))).toEqual(["CPA_SPIKE", "RESULTS_DROP"]);
    expect(kinds(perf(4, 3))).toEqual([]); // −25%
  });
  it("raises tracking-zero when an account spends with no conversions after converting before", () => {
    const a = account({ dailyResults: { ...daily("2026-09-20", "2026-10-10", 2), ...daily("2026-10-11", D, 0) } });
    const out = run([], [a]);
    expect(out.map((x) => x.kind)).toEqual(["TRACKING_ZERO"]); // the results drop it causes is not repeated
    expect(out[0].severity).toBe("critical");
  });
  it("tracking-zero needs $100 of spend and ≥25 prior results", () => {
    const quiet = { ...daily("2026-09-20", "2026-10-10", 2), ...daily("2026-10-11", D, 0) };
    expect(kinds(account({ dailyResults: quiet, daily: daily("2026-09-20", D, 3000) }))).toEqual([]); // $90 in 3 days
    expect(kinds(account({ dailyResults: { ...daily("2026-09-20", "2026-10-10", 1), ...daily("2026-10-11", D, 0) } }))).toEqual([]); // ~13 prior
  });
  it("can be turned off in settings", () => {
    expect(kinds(perf(4, 2), { ...DEFAULT_ALERT_SETTINGS, cpaSpikeAlerts: 0, resultsDropAlerts: 0 })).toEqual([]);
  });
  it("skips accounts without results data", () => {
    expect(kinds(account())).toEqual([]);
  });
});
