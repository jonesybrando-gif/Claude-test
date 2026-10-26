// Groups stored alerts by cause for the Alerts page, the client alerts strip
// and the sidebar badge, so "6 accounts on one expired Google login" reads as
// one issue instead of six alerts. Pure.

import { PLATFORM_LABEL, type PlatformKey } from "./platforms";

export type DisplaySeverity = "critical" | "warning" | "info";

export interface GroupableAlert {
  id: string;
  type: string;
  severity: string;
  clientId: string | null;
  accountId: string | null;
  details?: unknown;
  /** The platform login behind the alert's account, when known. */
  connection?: { id: string; platform: PlatformKey; status: string } | null;
  platform?: PlatformKey | null;
}

export interface AlertIssue<T extends GroupableAlert> {
  key: string;
  title: string;
  severity: DisplaySeverity;
  alerts: T[];
}

export const SEVERITY_RANK: Record<DisplaySeverity, number> = { critical: 3, warning: 2, info: 1 };

/** Underspending is amber, never red: red is kept for overspending and broken connections. */
export function displaySeverity(a: { type: string; severity: string }): DisplaySeverity {
  if (a.type === "UNDERSPENDING") return a.severity === "info" ? "info" : "warning";
  return a.severity === "critical" || a.severity === "warning" || a.severity === "info" ? a.severity : "warning";
}

export const ALERT_KIND_LABEL: Record<string, string> = {
  OVERSPENDING: "Overspending",
  UNDERSPENDING: "Underspending",
  PROJECTED_OVERRUN: "Projected overrun",
  SPEND_SPIKE: "Spend spike",
  SPEND_STOPPED: "Spend stopped",
  CAMPAIGN_NO_SPEND: "Campaign not spending",
  SYNC_FAILED: "Data sync",
  ACCOUNT_DISCONNECTED: "Disconnected",
  CPA_SPIKE: "Cost per result up",
  RESULTS_DROP: "Results down",
  TRACKING_ZERO: "No conversions recorded",
};

/** Where to go to fix an alert of this type for a client. */
export function alertFixLink(type: string, clientId: string): { href: string; label: string } {
  switch (type) {
    case "ACCOUNT_DISCONNECTED":
    case "SYNC_FAILED":
      return { href: "/integrations", label: "Fix connection" };
    case "OVERSPENDING":
    case "UNDERSPENDING":
    case "PROJECTED_OVERRUN":
      return { href: `/clients/${clientId}/budgets`, label: "Review budget" };
    default:
      return { href: `/clients/${clientId}/campaigns`, label: "Review campaigns" };
  }
}

const accountIdsOf = (a: GroupableAlert): string[] | null => {
  const ids = (a.details as { accountIds?: unknown } | null | undefined)?.accountIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : null;
};

/**
 * Alerts hidden because another open alert already explains them: an
 * underspending or shortfall alert while the same line's account (or, for
 * older alerts without account ids, the same client) has stopped spending.
 */
export function shadowedAlertIds(alerts: GroupableAlert[]): Set<string> {
  const stopped = alerts.filter((a) => a.type === "SPEND_STOPPED");
  const out = new Set<string>();
  if (!stopped.length) return out;
  const accounts = new Set(stopped.map((a) => a.accountId).filter((x): x is string => !!x));
  const clients = new Set(stopped.map((a) => a.clientId));
  for (const a of alerts) {
    if (a.type !== "UNDERSPENDING") continue;
    const ids = accountIdsOf(a);
    if (ids ? ids.some((id) => accounts.has(id)) : clients.has(a.clientId)) out.add(a.id);
  }
  return out;
}

/** Drops muted types (Client.mutedAlertTypes) and shadowed alerts. */
export function visibleAlerts<T extends GroupableAlert>(alerts: T[], mutedByClient: Map<string, string[]>): T[] {
  const kept = alerts.filter((a) => !(a.clientId && mutedByClient.get(a.clientId)?.includes(a.type)));
  const shadowed = shadowedAlertIds(kept);
  return kept.filter((a) => !shadowed.has(a.id));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function causeKey(a: GroupableAlert): string {
  if ((a.type === "ACCOUNT_DISCONNECTED" || a.type === "SYNC_FAILED") && a.connection) return `${a.type}:conn:${a.connection.id}`;
  return a.type;
}

function causeTitle(type: string, items: GroupableAlert[], opts: { campaignNoSpendDays?: number }): string {
  const n = items.length;
  const conn = items[0].connection;
  const platform = conn ? PLATFORM_LABEL[conn.platform] : items[0].platform ? PLATFORM_LABEL[items[0].platform] : null;
  switch (type) {
    case "ACCOUNT_DISCONNECTED":
      if (conn && (conn.status === "NEEDS_REAUTH" || conn.status === "DISCONNECTED")) return `${platform} login expired — ${plural(n, "account", "accounts")} not updating`;
      return `${plural(n, "account", "accounts")} disconnected${platform ? ` (${platform})` : ""} — not updating`;
    case "SYNC_FAILED":
      return `${plural(n, "account", "accounts")}${platform ? ` on ${platform}` : ""} not updating`;
    case "CAMPAIGN_NO_SPEND":
      return `${plural(n, "campaign hasn't", "campaigns haven't")} spent in ${opts.campaignNoSpendDays ?? 3}+ days`;
    case "SPEND_STOPPED":
      return `${plural(n, "account", "accounts")} stopped spending`;
    case "SPEND_SPIKE":
      return `${plural(n, "account", "accounts")} with a spend spike`;
    case "OVERSPENDING":
      return `${plural(n, "budget line", "budget lines")} overspending`;
    case "PROJECTED_OVERRUN":
      return `${plural(n, "budget line", "budget lines")} forecast to go over budget`;
    case "UNDERSPENDING":
      return `${plural(n, "budget line", "budget lines")} underspending`;
    case "CPA_SPIKE":
      return `Cost per result jumped for ${plural(n, "client", "clients")}`;
    case "RESULTS_DROP":
      return `Results dropped for ${plural(n, "client", "clients")}`;
    case "TRACKING_ZERO":
      return `${plural(n, "account", "accounts")} spending with no conversions recorded`;
    default:
      return `${plural(n, "alert", "alerts")}: ${ALERT_KIND_LABEL[type] ?? type}`;
  }
}

/**
 * One issue per cause: an expired login, a type of pacing problem, quiet
 * campaigns… A single-alert issue keeps the alert's own message. Sorted by
 * severity (critical first), then size.
 */
export function groupAlertsByCause<T extends GroupableAlert & { message?: string }>(alerts: T[], opts: { campaignNoSpendDays?: number } = {}): AlertIssue<T>[] {
  const by = new Map<string, T[]>();
  for (const a of alerts) by.set(causeKey(a), [...(by.get(causeKey(a)) ?? []), a]);
  return [...by.entries()]
    .map(([key, items]) => {
      const severity = items.map(displaySeverity).sort((x, y) => SEVERITY_RANK[y] - SEVERITY_RANK[x])[0];
      const sorted = [...items].sort((x, y) => SEVERITY_RANK[displaySeverity(y)] - SEVERITY_RANK[displaySeverity(x)]);
      return { key, severity, alerts: sorted, title: causeTitle(items[0].type, items, opts) };
    })
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.alerts.length - a.alerts.length || a.title.localeCompare(b.title));
}
