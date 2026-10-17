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
    expect(a.map((x) => [x.kind, x.severity, x.dedupeKey])).toEqual([["OVERSPENDING", "critical", "OVERSPENDING:b1:2026-10-01"]]);
    expect(run([row({ status: "UNDERSPENDING" })])[0].kind).toBe("UNDERSPENDING");
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
    const a = run([row({ status: "ON_TARGET", forecastStatus: "UNDERSPENDING" })]);
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
    expect(run([], [account({ lastSuccessfulSyncAt: new Date(NOW.getTime() - 30 * 3600_000) })])[0].title).toContain("data not updated");
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
