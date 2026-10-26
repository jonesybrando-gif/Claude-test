// Alert rules. Pure: given pacing results and recent daily spend, return the
// set of conditions that are currently true. The runner (src/server/alerts.ts)
// turns these into stored alerts: creating new ones, refreshing ones that are
// still true, and resolving ones that no longer are. Each condition has a
// stable dedupe key, so an unresolved issue is only ever notified once.

import { addDays, eachDay, type IsoDate } from "./pacing/dates";
import type { PacingStatus } from "./pacing/status";
import { formatMoney } from "./money";
import { formatDate } from "./time";
import { forecastOffBudget } from "./portfolio";

/**
 * Every alert title has one shape: "<What happened> · <budget line, account or
 * campaign>". The client is shown separately, so it is never repeated here.
 */
export function alertTitle(issue: string, scope: string): string {
  const what = issue.charAt(0).toUpperCase() + issue.slice(1);
  return scope ? `${what} · ${scope}` : what;
}

export type AlertKind =
  | "OVERSPENDING"
  | "UNDERSPENDING"
  | "PROJECTED_OVERRUN"
  | "SPEND_SPIKE"
  | "SPEND_STOPPED"
  | "CAMPAIGN_NO_SPEND"
  | "SYNC_FAILED"
  | "ACCOUNT_DISCONNECTED"
  | "CPA_SPIKE"
  | "RESULTS_DROP"
  | "TRACKING_ZERO";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertSettings {
  /** Projected month-end spend above budget by more than this % raises PROJECTED_OVERRUN. */
  overrunPct: number;
  /** A day's spend above this multiple of the prior 7-day average raises SPEND_SPIKE. */
  spikeMultiplier: number;
  /** Ignore spikes on accounts averaging less than this per day (minor units). */
  spikeMinDailyMinor: number;
  /** Consecutive complete days at zero spend that raise SPEND_STOPPED. */
  stoppedDays: number;
  /** Only accounts averaging at least this per day beforehand (minor units) can "stop". */
  stoppedMinDailyMinor: number;
  /** Consecutive zero-spend days for an enabled campaign that spent before. */
  campaignNoSpendDays: number;
  /** Hours since the last successful sync before data counts as stale. */
  staleHours: number;
  /** Performance alerts, on (1) or off (0). */
  cpaSpikeAlerts: number;
  resultsDropAlerts: number;
  trackingZeroAlerts: number;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  overrunPct: 5,
  spikeMultiplier: 2,
  spikeMinDailyMinor: 2000,
  stoppedDays: 2,
  stoppedMinDailyMinor: 1000,
  campaignNoSpendDays: 3,
  staleHours: 26,
  cpaSpikeAlerts: 1,
  resultsDropAlerts: 1,
  trackingZeroAlerts: 1,
};

/** Minimum volumes and thresholds for the performance alerts (fixed, so small samples never alert). */
export const PERFORMANCE_RULES = {
  /** Cost per result, last 7 complete days vs the 7 before, up at least this %, with ≥ minResults in each. */
  cpaSpikePct: 40,
  /** Results, last 7 complete days vs the 7 before, down at least this %, with ≥ minResults before. */
  resultsDropPct: 40,
  minResults: 10,
  /** Spend over the last 3 complete days with zero results, after ≥ trackingPriorResults in the 14 days before. */
  trackingMinSpendMinor: 10000,
  trackingPriorResults: 5,
} as const;

/** Plain descriptions of the performance alerts, for Settings › Alerts. */
export const PERFORMANCE_ALERT_RULES: { setting: "cpaSpikeAlerts" | "resultsDropAlerts" | "trackingZeroAlerts"; kind: AlertKind; title: string; description: string }[] = [
  { setting: "cpaSpikeAlerts", kind: "CPA_SPIKE", title: "Cost per result jumps", description: "Each result (lead, call, sale…) cost at least 40% more over the last 7 days than the 7 days before. Only when there were at least 10 results in both weeks." },
  { setting: "resultsDropAlerts", kind: "RESULTS_DROP", title: "Results drop", description: "At least 40% fewer results over the last 7 days than the 7 days before. Only when the earlier week had at least 10 results." },
  { setting: "trackingZeroAlerts", kind: "TRACKING_ZERO", title: "Spending but no conversions recorded", description: "An account spent $100 or more over the last 3 days but recorded no conversions, after at least 5 in the two weeks before. Conversion tracking may be broken." },
];

export function resolveAlertSettings(raw: unknown): AlertSettings {
  const s = { ...DEFAULT_ALERT_SETTINGS };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(s) as (keyof AlertSettings)[]) {
      const v = Number((raw as Record<string, unknown>)[k]);
      if (Number.isFinite(v) && v >= 0) s[k] = v;
    }
  }
  return s;
}

export function validateAlertSettings(s: AlertSettings): string[] {
  const p: string[] = [];
  if (s.overrunPct < 0 || s.overrunPct > 100) p.push("Projected overrun must be between 0% and 100%.");
  if (s.spikeMultiplier < 1.1 || s.spikeMultiplier > 20) p.push("Spike multiplier must be between 1.1× and 20×.");
  if (!Number.isInteger(s.stoppedDays) || s.stoppedDays < 1 || s.stoppedDays > 14) p.push("Spend-stopped days must be a whole number from 1 to 14.");
  if (!Number.isInteger(s.campaignNoSpendDays) || s.campaignNoSpendDays < 1 || s.campaignNoSpendDays > 30) p.push("Campaign no-spend days must be a whole number from 1 to 30.");
  if (s.staleHours < 2 || s.staleHours > 168) p.push("Stale-data hours must be between 2 and 168.");
  for (const k of ["cpaSpikeAlerts", "resultsDropAlerts", "trackingZeroAlerts"] as const) if (s[k] !== 0 && s[k] !== 1) p.push("Performance alerts must be on or off.");
  return p;
}

export interface AlertCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  dedupeKey: string;
  clientId: string;
  clientName: string;
  accountId?: string;
  title: string;
  detail: string;
  isDemo: boolean;
  /** Pacing alerts: the ad accounts behind the budget line. */
  accountIds?: string[];
}

export interface PacingRowInput {
  key: string;
  clientId: string;
  clientName: string;
  label: string;
  currency: string;
  isDemo: boolean;
  /** Line depends on a disconnected account: its pacing reflects missing data, covered by ACCOUNT_DISCONNECTED. */
  disconnected?: boolean;
  /** No ad account linked (or never synced): nothing to pace, so no pacing alerts. */
  notConnected?: boolean;
  /** Ad accounts behind the line (used to suppress underspend alerts while an account has stopped spending). */
  accountIds?: string[];
  result: {
    phase: "NOT_STARTED" | "ACTIVE" | "ENDED";
    periodStart: IsoDate;
    status: PacingStatus;
    forecastStatus: PacingStatus;
    budgetMinor: number;
    projectedVarianceMinor: number;
    /** Complete days of data in the period so far; pacing alerts wait for 3. */
    elapsedDays?: number;
  } | null;
  action: { headline: string; detail: string };
}

export interface AccountInput {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  currency: string;
  isDemo: boolean;
  /** False for accounts the agency chose to stop monitoring. */
  monitored: boolean;
  status: "ACTIVE" | "NEEDS_REAUTH" | "DISCONNECTED" | "PENDING_APPROVAL";
  lastSuccessfulSyncAt: Date | null;
  lastSyncFailed: { at: Date; error: string } | null;
  dataCompleteThrough: IsoDate | null;
  /** Daily spend (minor units) for recent dates; missing = 0. */
  daily: Record<IsoDate, number>;
  /** Daily results (conversions counted once per platform) for recent dates; missing = 0. Omit to skip performance alerts. */
  dailyResults?: Record<IsoDate, number>;
}

export interface CampaignInput {
  id: string;
  name: string;
  accountId: string;
  status: "ENABLED" | "PAUSED" | "REMOVED" | "UNKNOWN";
  daily: Record<IsoDate, number>;
}

const sumDays = (daily: Record<IsoDate, number>, from: IsoDate, to: IsoDate) => eachDay(from, to).reduce((s, d) => s + (daily[d] ?? 0), 0);

/** Pacing alerts wait for this many complete days in the period, so day-one noise never alerts. */
export const MIN_PACING_DAYS = 3;

export function evaluateAlerts(input: {
  rows: PacingRowInput[];
  accounts: AccountInput[];
  campaigns: CampaignInput[];
  settings: AlertSettings;
  now: Date;
  /** Alert types muted per client (Client.mutedAlertTypes): never raised for that client. */
  muted?: Record<string, AlertKind[]>;
}): AlertCandidate[] {
  const { settings: s, now } = input;
  const out: AlertCandidate[] = [];

  // 1. Pacing and month-end forecast (budget lines). One key per line and
  // direction, so moving between "overspending" and "projected overrun" (or
  // critical and warning underspend) updates one alert instead of closing one
  // and opening another.
  for (const r of input.rows) {
    const res = r.result;
    if (!res || res.phase !== "ACTIVE" || r.disconnected || r.notConnected) continue;
    if ((res.elapsedDays ?? Infinity) < MIN_PACING_DAYS) continue;
    if (!forecastOffBudget(res.budgetMinor, res.projectedVarianceMinor)) continue;
    const base = { clientId: r.clientId, clientName: r.clientName, isDemo: r.isDemo, detail: r.action.detail, accountIds: r.accountIds };
    const overKey = `PACING_OVER:${r.key}:${res.periodStart}`;
    const underKey = `PACING_UNDER:${r.key}:${res.periodStart}`;
    if (res.projectedVarianceMinor > 0) {
      if (res.status === "OVERSPENDING") {
        out.push({ ...base, kind: "OVERSPENDING", severity: "critical", dedupeKey: overKey, title: alertTitle(r.action.headline, r.label) });
      } else if (res.budgetMinor > 0 && res.projectedVarianceMinor > (res.budgetMinor * s.overrunPct) / 100) {
        out.push({
          ...base,
          kind: "PROJECTED_OVERRUN",
          severity: "warning",
          dedupeKey: overKey,
          title: alertTitle(`projected to exceed budget by ${formatMoney(res.projectedVarianceMinor, r.currency, { whole: true })}`, r.label),
        });
      }
    } else if (res.status === "UNDERSPENDING") {
      out.push({ ...base, kind: "UNDERSPENDING", severity: "critical", dedupeKey: underKey, title: alertTitle(r.action.headline, r.label) });
    } else if (res.forecastStatus === "UNDERSPENDING") {
      // On plan so far but the month will finish well short (e.g. after a budget increase)
      out.push({ ...base, kind: "UNDERSPENDING", severity: "warning", dedupeKey: underKey, title: alertTitle(r.action.headline, r.label) });
    }
  }

  // 2. Account health and spend patterns
  for (const a of input.accounts) {
    if (!a.monitored) continue;
    const base = { clientId: a.clientId, clientName: a.clientName, accountId: a.id, isDemo: a.isDemo };
    if (a.status === "NEEDS_REAUTH" || a.status === "DISCONNECTED" || a.status === "PENDING_APPROVAL") {
      out.push({
        ...base,
        kind: "ACCOUNT_DISCONNECTED",
        severity: "critical",
        dedupeKey: `ACCOUNT_DISCONNECTED:${a.id}`,
        title: alertTitle(a.status === "PENDING_APPROVAL" ? "waiting on platform approval" : "account disconnected", a.name),
        detail: a.status === "PENDING_APPROVAL" ? "The platform hasn't approved API access yet; no new data is arriving." : "Reconnect the platform login under Integrations. No new data is arriving.",
      });
      continue; // sync and spend alerts would only repeat this
    }
    const hoursSince = a.lastSuccessfulSyncAt ? (now.getTime() - a.lastSuccessfulSyncAt.getTime()) / 3_600_000 : Infinity;
    if (a.lastSyncFailed || hoursSince > s.staleHours) {
      out.push({
        ...base,
        kind: "SYNC_FAILED",
        severity: "warning",
        dedupeKey: `SYNC_FAILED:${a.id}`,
        title: alertTitle(a.lastSyncFailed ? "latest sync failed" : "data not updated", a.name),
        detail: a.lastSyncFailed
          ? `${a.lastSyncFailed.error.slice(0, 200)}`
          : hoursSince === Infinity
            ? "This account has never synced successfully."
            : `Last successful sync ${Math.round(hoursSince)} hours ago. Pacing uses older data until it updates.`,
      });
    }

    const d = a.dataCompleteThrough;
    if (!d) continue;
    // Spike: last complete day vs the 7 days before it
    const prior = sumDays(a.daily, addDays(d, -7), addDays(d, -1)) / 7;
    const last = a.daily[d] ?? 0;
    if (prior >= s.spikeMinDailyMinor && last > prior * s.spikeMultiplier) {
      out.push({
        ...base,
        kind: "SPEND_SPIKE",
        severity: "warning",
        dedupeKey: `SPEND_SPIKE:${a.id}:${d}`,
        title: alertTitle(`spend jumped to ${formatMoney(last, a.currency, { whole: true })} on ${formatDate(d)}`, a.name),
        detail: `That is ${(last / prior).toFixed(1)}× the previous 7-day average of ${formatMoney(Math.round(prior), a.currency, { whole: true })}/day.`,
      });
    }
    // Stopped: the last N complete days at zero after normal spending
    const n = s.stoppedDays;
    const recent = sumDays(a.daily, addDays(d, -(n - 1)), d);
    const before = sumDays(a.daily, addDays(d, -(n + 6)), addDays(d, -n)) / 7;
    const stopped = recent === 0 && before >= s.stoppedMinDailyMinor;
    if (stopped) {
      out.push({
        ...base,
        kind: "SPEND_STOPPED",
        severity: "critical",
        dedupeKey: `SPEND_STOPPED:${a.id}`,
        title: alertTitle("spending stopped", a.name),
        detail: `No spend for the last ${n} complete day${n === 1 ? "" : "s"} (through ${formatDate(d)}), after averaging ${formatMoney(Math.round(before), a.currency, { whole: true })}/day. Check billing, approvals and campaign status.`,
      });
      continue; // per-campaign no-spend alerts would only repeat this
    }
    if (a.dailyResults && s.trackingZeroAlerts) {
      // Tracking: real spend over the last 3 days with no results, after results before.
      const R = PERFORMANCE_RULES;
      const spend3 = sumDays(a.daily, addDays(d, -2), d);
      const results3 = sumDays(a.dailyResults, addDays(d, -2), d);
      const prior14 = sumDays(a.dailyResults, addDays(d, -16), addDays(d, -3));
      if (spend3 >= R.trackingMinSpendMinor && results3 === 0 && prior14 >= R.trackingPriorResults) {
        out.push({
          ...base,
          kind: "TRACKING_ZERO",
          severity: "critical",
          dedupeKey: `TRACKING_ZERO:${a.id}`,
          title: alertTitle("spending but no conversions recorded", a.name),
          detail: `${formatMoney(spend3, a.currency, { whole: true })} spent over the last 3 complete days (through ${formatDate(d)}) with no conversions, after ${Math.round(prior14)} in the two weeks before. Check that conversion tracking still works.`,
        });
      }
    }
    // Campaigns that went quiet while enabled
    const m = s.campaignNoSpendDays;
    for (const c of input.campaigns.filter((c) => c.accountId === a.id && c.status === "ENABLED")) {
      const quiet = sumDays(c.daily, addDays(d, -(m - 1)), d) === 0;
      const spentBefore = sumDays(c.daily, addDays(d, -(m + 13)), addDays(d, -m)) > 0;
      if (quiet && spentBefore) {
        out.push({
          ...base,
          kind: "CAMPAIGN_NO_SPEND",
          severity: "warning",
          dedupeKey: `CAMPAIGN_NO_SPEND:${c.id}`,
          title: alertTitle(`no spend for ${m} days`, c.name),
          detail: `The campaign is enabled in ${a.name} but hasn't spent since before ${formatDate(addDays(d, -(m - 1)))}. Check budget, bids, approvals and targeting.`,
        });
      }
    }
  }
  out.push(...performanceAlerts(input.accounts, s, out));

  // An account that stopped spending explains any underspend on its budget lines: alert once.
  const stopped = new Set(out.filter((c) => c.kind === "SPEND_STOPPED").map((c) => c.accountId!));
  const stoppedClients = new Set(out.filter((c) => c.kind === "SPEND_STOPPED").map((c) => c.clientId));
  const muted = input.muted ?? {};
  return out.filter((c) => {
    if (muted[c.clientId]?.includes(c.kind)) return false;
    if (c.dedupeKey.startsWith("PACING_UNDER:")) {
      if (c.accountIds ? c.accountIds.some((id) => stopped.has(id)) : stoppedClients.has(c.clientId)) return false;
    }
    return true;
  });
}

/**
 * Cost-per-result spikes and results drops, per client: the last 7 complete
 * days against the 7 before, summed over each healthy account's own complete
 * days. Skipped for a client whose spend stopped or whose tracking looks
 * broken (those alerts already explain the change).
 */
function performanceAlerts(accounts: AccountInput[], s: AlertSettings, raised: AlertCandidate[]): AlertCandidate[] {
  const R = PERFORMANCE_RULES;
  const explained = new Set(raised.filter((c) => c.kind === "SPEND_STOPPED" || c.kind === "TRACKING_ZERO" || c.kind === "ACCOUNT_DISCONNECTED").map((c) => c.clientId));
  const byClient = new Map<string, { name: string; currency: string; isDemo: boolean; cur: { spend: number; results: number }; prev: { spend: number; results: number } }>();
  for (const a of accounts) {
    if (!a.monitored || !a.dailyResults || !a.dataCompleteThrough || a.status !== "ACTIVE") continue;
    const d = a.dataCompleteThrough;
    const c = byClient.get(a.clientId) ?? { name: a.clientName, currency: a.currency, isDemo: false, cur: { spend: 0, results: 0 }, prev: { spend: 0, results: 0 } };
    c.cur.spend += sumDays(a.daily, addDays(d, -6), d);
    c.cur.results += sumDays(a.dailyResults, addDays(d, -6), d);
    c.prev.spend += sumDays(a.daily, addDays(d, -13), addDays(d, -7));
    c.prev.results += sumDays(a.dailyResults, addDays(d, -13), addDays(d, -7));
    c.isDemo ||= a.isDemo;
    byClient.set(a.clientId, c);
  }
  const out: AlertCandidate[] = [];
  for (const [clientId, c] of byClient) {
    if (explained.has(clientId)) continue;
    const base = { clientId, clientName: c.name, isDemo: c.isDemo };
    if (s.cpaSpikeAlerts && c.cur.results >= R.minResults && c.prev.results >= R.minResults) {
      const now = c.cur.spend / c.cur.results;
      const before = c.prev.spend / c.prev.results;
      if (before > 0 && now >= before * (1 + R.cpaSpikePct / 100)) {
        out.push({
          ...base,
          kind: "CPA_SPIKE",
          severity: "warning",
          dedupeKey: `CPA_SPIKE:${clientId}`,
          title: alertTitle(`cost per result up ${Math.round((now / before - 1) * 100)}%`, "last 7 days"),
          detail: `Each result cost ≈${formatMoney(Math.round(now), c.currency)} over the last 7 complete days, up from ≈${formatMoney(Math.round(before), c.currency)} the week before (${Math.round(c.cur.results)} vs ${Math.round(c.prev.results)} results). Check search terms, audiences, bids and landing pages.`,
        });
      }
    }
    if (s.resultsDropAlerts && c.prev.results >= R.minResults && c.cur.results <= c.prev.results * (1 - R.resultsDropPct / 100)) {
      out.push({
        ...base,
        kind: "RESULTS_DROP",
        severity: "warning",
        dedupeKey: `RESULTS_DROP:${clientId}`,
        title: alertTitle(`results down ${Math.round((1 - c.cur.results / c.prev.results) * 100)}%`, "last 7 days"),
        detail: `${Math.round(c.cur.results)} results over the last 7 complete days, down from ${Math.round(c.prev.results)} the week before, while spend went from ${formatMoney(c.prev.spend, c.currency, { whole: true })} to ${formatMoney(c.cur.spend, c.currency, { whole: true })}. Check tracking, budgets and campaign changes.`,
      });
    }
  }
  return out;
}
