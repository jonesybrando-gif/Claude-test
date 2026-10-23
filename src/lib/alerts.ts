// Alert rules. Pure: given pacing results and recent daily spend, return the
// set of conditions that are currently true. The runner (src/server/alerts.ts)
// turns these into stored alerts: creating new ones, refreshing ones that are
// still true, and resolving ones that no longer are. Each condition has a
// stable dedupe key, so an unresolved issue is only ever notified once.

import { addDays, eachDay, type IsoDate } from "./pacing/dates";
import type { PacingStatus } from "./pacing/status";
import { formatMoney } from "./money";
import { formatDate } from "./time";

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
  | "ACCOUNT_DISCONNECTED";

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
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  overrunPct: 5,
  spikeMultiplier: 2,
  spikeMinDailyMinor: 2000,
  stoppedDays: 2,
  stoppedMinDailyMinor: 1000,
  campaignNoSpendDays: 3,
  staleHours: 26,
};

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
  result: {
    phase: "NOT_STARTED" | "ACTIVE" | "ENDED";
    periodStart: IsoDate;
    status: PacingStatus;
    forecastStatus: PacingStatus;
    budgetMinor: number;
    projectedVarianceMinor: number;
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
}

export interface CampaignInput {
  id: string;
  name: string;
  accountId: string;
  status: "ENABLED" | "PAUSED" | "REMOVED" | "UNKNOWN";
  daily: Record<IsoDate, number>;
}

const sumDays = (daily: Record<IsoDate, number>, from: IsoDate, to: IsoDate) => eachDay(from, to).reduce((s, d) => s + (daily[d] ?? 0), 0);

export function evaluateAlerts(input: {
  rows: PacingRowInput[];
  accounts: AccountInput[];
  campaigns: CampaignInput[];
  settings: AlertSettings;
  now: Date;
}): AlertCandidate[] {
  const { settings: s, now } = input;
  const out: AlertCandidate[] = [];

  // 1. Pacing and month-end forecast (budget lines)
  for (const r of input.rows) {
    const res = r.result;
    if (!res || res.phase !== "ACTIVE" || r.disconnected || r.notConnected) continue;
    const base = { clientId: r.clientId, clientName: r.clientName, isDemo: r.isDemo, detail: r.action.detail };
    if (res.status === "OVERSPENDING" || res.status === "UNDERSPENDING") {
      out.push({ ...base, kind: res.status, severity: "critical", dedupeKey: `${res.status}:${r.key}:${res.periodStart}`, title: alertTitle(r.action.headline, r.label) });
    } else if (res.forecastStatus === "UNDERSPENDING") {
      // On plan so far but the month will finish well short (e.g. after a budget increase)
      out.push({ ...base, kind: "UNDERSPENDING", severity: "warning", dedupeKey: `UNDERSPENDING:${r.key}:${res.periodStart}`, title: alertTitle(r.action.headline, r.label) });
    }
    const overrun = res.budgetMinor > 0 && res.projectedVarianceMinor > (res.budgetMinor * s.overrunPct) / 100;
    if (overrun && res.status !== "OVERSPENDING") {
      out.push({
        ...base,
        kind: "PROJECTED_OVERRUN",
        severity: "warning",
        dedupeKey: `PROJECTED_OVERRUN:${r.key}:${res.periodStart}`,
        title: alertTitle(`projected to exceed budget by ${formatMoney(res.projectedVarianceMinor, r.currency, { whole: true })}`, r.label),
      });
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
  return out;
}
