import Link from "next/link";
import type { AlertType, Prisma } from "@prisma/client";
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { relativeTime } from "@/lib/time";
import { resolveAlertSettings } from "@/lib/alerts";
import { ALERT_KIND_LABEL, alertFixLink, displaySeverity, groupAlertsByCause, visibleAlerts, type AlertIssue } from "@/lib/alert-groups";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/status-badge";
import { AcknowledgeButton, AlertFilters, CheckNowButton, SnoozeControl } from "../alerts/buttons";
import { OpportunitiesList } from "./opportunities";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Insights" };

const SEV = {
  critical: { Icon: AlertOctagon, cls: "text-critical-ink", label: "Critical" },
  warning: { Icon: AlertTriangle, cls: "text-warning-ink", label: "Warning" },
  info: { Icon: Info, cls: "text-info-ink", label: "Info" },
} as const;

const TABS = [
  { key: "open", label: "Open" },
  { key: "snoozed", label: "Snoozed" },
  { key: "resolved", label: "Resolved (14 days)" },
] as const;

type Sp = { view?: string; tab?: string; type?: string; client?: string; label?: string; owner?: string };

const alertSelect = {
  id: true,
  type: true,
  severity: true,
  status: true,
  clientId: true,
  accountId: true,
  message: true,
  details: true,
  firstSeenAt: true,
  lastSeenAt: true,
  resolvedAt: true,
  snoozedUntil: true,
  acknowledgedById: true,
  account: { select: { platform: true, connection: { select: { id: true, platform: true, status: true } } } },
} satisfies Prisma.AlertSelect;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireAgencyStaff();
  const sp = await searchParams;
  const view = sp.view === "opportunities" ? "opportunities" : "issues";
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "open";
  const now = new Date();
  const [visibleClients, labels, agency] = await Promise.all([
    prisma.client.findMany({
      where: visibleClientsWhere(user),
      select: { id: true, name: true, mutedAlertTypes: true, primaryManager: { select: { id: true, name: true } }, labels: { select: { id: true, name: true, color: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.agency.findUniqueOrThrow({ where: { id: user.agencyId }, select: { alertSettings: true } }),
  ]);
  const clientById = new Map(visibleClients.map((c) => [c.id, c]));
  // Filters: type, client, label and owner (the client's primary account manager).
  const clientIds = visibleClients
    .filter((c) => !sp.client || c.id === sp.client)
    .filter((c) => !sp.label || c.labels.some((l) => l.id === sp.label))
    .filter((c) => !sp.owner || (sp.owner === "me" ? c.primaryManager?.id === user.id : sp.owner === "none" ? !c.primaryManager : c.primaryManager?.id === sp.owner))
    .map((c) => c.id);
  const notSnoozed: Prisma.AlertWhereInput = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
  const statusWhere: Prisma.AlertWhereInput =
    tab === "resolved"
      ? { status: "RESOLVED", resolvedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }
      : tab === "snoozed"
        ? { status: { in: ["OPEN", "ACKNOWLEDGED"] }, snoozedUntil: { gt: now } }
        : { status: { in: ["OPEN", "ACKNOWLEDGED"] }, ...notSnoozed };
  const raw = await prisma.alert.findMany({
    where: { agencyId: user.agencyId, clientId: { in: clientIds }, ...(sp.type && sp.type in ALERT_KIND_LABEL ? { type: sp.type as AlertType } : {}), ...statusWhere },
    select: alertSelect,
    orderBy: [{ firstSeenAt: "desc" }],
    take: 1000,
  });
  // Muted types and alerts explained by another alert (underspend while spend stopped) are hidden.
  const muted = new Map(visibleClients.map((c) => [c.id, c.mutedAlertTypes as string[]]));
  const withConn = raw.map((a) => ({ ...a, connection: a.account?.connection ?? null, platform: a.account?.platform ?? null }));
  const alerts = tab === "resolved" ? withConn : visibleAlerts(withConn, muted);
  const ackers = new Map((await prisma.user.findMany({ where: { id: { in: alerts.map((a) => a.acknowledgedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Opening the page marks this person's alert notifications as read.
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });

  const settings = resolveAlertSettings(agency.alertSettings);
  const opts = { campaignNoSpendDays: settings.campaignNoSpendDays };
  const open = tab === "open" ? alerts.filter((a) => a.status === "OPEN") : alerts;
  const acknowledged = tab === "open" ? alerts.filter((a) => a.status === "ACKNOWLEDGED") : [];
  const issues = groupAlertsByCause(open, opts);
  const ackIssues = groupAlertsByCause(acknowledged, opts);
  const openIds = open.filter((a) => a.status === "OPEN").map((a) => a.id);
  const owners = [...new Map(visibleClients.filter((c) => c.primaryManager).map((c) => [c.primaryManager!.id, c.primaryManager!.name])).entries()].filter(([id]) => id !== user.id).sort((a, b) => a[1].localeCompare(b[1]));
  const tabHref = (key: string) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "tab") as [string, string][]);
    if (key !== "open") q.set("tab", key);
    return `/insights${q.size ? `?${q}` : ""}`;
  };
  const filtered = !!(sp.type || sp.client || sp.label || sp.owner);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const issueCard = (issue: AlertIssue<(typeof alerts)[number]>, acked = false) => {
    const sev = SEV[issue.severity];
    const single = issue.alerts.length === 1;
    const ids = issue.alerts.map((a) => a.id);
    const clientsIn = [...new Set(issue.alerts.map((a) => a.clientId))];
    return (
      <Card key={issue.key}>
        <div className="flex flex-wrap items-start gap-3 px-5 py-4">
          <sev.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${sev.cls}`} aria-label={sev.label} />
          <div className="min-w-0 flex-1">
            {single ? (
              alertBody(issue.alerts[0], true)
            ) : (
              <>
                <p className="text-sm font-semibold">{issue.title}</p>
                <p className="text-xs text-text-3">
                  {plural(clientsIn.length, "client")}: {clientsIn.slice(0, 4).map((id) => clientById.get(id ?? "")?.name ?? "Unknown").join(", ")}
                  {clientsIn.length > 4 && ` and ${clientsIn.length - 4} more`}
                </p>
              </>
            )}
          </div>
          {tab !== "resolved" && (
            <div className="flex flex-wrap items-center gap-2">
              {!acked && tab === "open" && <AcknowledgeButton alertIds={ids} label={single ? "Acknowledge" : `Acknowledge all ${ids.length}`} />}
              <SnoozeControl alertIds={ids} snoozed={tab === "snoozed"} label={single ? "Snooze" : "Snooze all"} />
            </div>
          )}
        </div>
        {!single && (
          <details className="group border-t border-border">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 px-5 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /> Show the {issue.alerts.length} alerts
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {issue.alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 py-3 pr-5 pl-12">
                  <div className="min-w-0 flex-1">{alertBody(a, false)}</div>
                  {a.status === "OPEN" && tab === "open" && <AcknowledgeButton alertIds={[a.id]} variant="ghost" />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    );
  };

  function alertBody(a: (typeof alerts)[number], withTitleSize: boolean) {
    const d = (a.details ?? {}) as { detail?: string; isDemo?: boolean };
    const client = clientById.get(a.clientId ?? "");
    const fix = a.clientId ? alertFixLink(a.type, a.clientId) : null;
    const sev = displaySeverity(a);
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {client ? <Link href={`/clients/${client.id}`} className="font-medium text-text hover:underline">{client.name}</Link> : <span className="font-medium">Unknown client</span>}
          <Badge variant={sev === "critical" ? "critical" : "warning"}>{ALERT_KIND_LABEL[a.type] ?? a.type}</Badge>
          {d.isDemo && <DemoBadge />}
          {a.status === "ACKNOWLEDGED" && <Badge variant="neutral">Acknowledged by {ackers.get(a.acknowledgedById ?? "") ?? "someone"}</Badge>}
          {tab === "snoozed" && a.snoozedUntil && <Badge variant="neutral">Snoozed until {a.snoozedUntil.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge>}
        </div>
        <p className={`mt-1 ${withTitleSize ? "text-sm font-semibold" : "text-sm font-medium"}`}>{a.message}</p>
        {d.detail && <p className="text-sm text-text-2">{d.detail}</p>}
        <p className="mt-1 text-xs text-text-3">
          First seen {relativeTime(a.firstSeenAt.toISOString()).toLowerCase()}
          {a.status === "RESOLVED" && a.resolvedAt ? ` · resolved ${relativeTime(a.resolvedAt.toISOString()).toLowerCase()}` : ` · still true as of ${relativeTime(a.lastSeenAt.toISOString()).toLowerCase()}`}
          {fix && a.status !== "RESOLVED" && <> · <Link href={fix.href} className="text-brand-text hover:underline">{fix.label}</Link></>}
        </p>
      </>
    );
  }

  const viewHref = (v: "issues" | "opportunities") => (v === "issues" ? "/insights" : "/insights?view=opportunities");
  const header = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Insights</h1>
          <p className="max-w-[70ch] text-sm text-text-2">What needs fixing, what could be better, and what to do next, across every client. Nothing here has been acted on until someone on your team does it.</p>
        </div>
        {view === "issues" && user.role === "AGENCY_ADMIN" && <CheckNowButton />}
      </div>
      <div role="tablist" aria-label="AI Insights" className="inline-flex self-start rounded-lg bg-surface-2 p-1">
        {(["issues", "opportunities"] as const).map((v) => (
          <Link key={v} role="tab" aria-selected={view === v} href={viewHref(v)} className={`min-h-9 rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-surface font-semibold text-text shadow-sm" : "text-text-2 hover:text-text"}`}>
            {v === "issues" ? "Issues" : "Opportunities"}
            {v === "issues" && open.length > 0 && <span className="ml-1.5 tabular text-text-3">{issues.length}</span>}
          </Link>
        ))}
      </div>
    </div>
  );

  if (view === "opportunities") {
    return (
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
        {header}
        <OpportunitiesList clients={visibleClients.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      {header}
      <p className="text-sm text-text-2">
        {tab === "open" ? (
          <>
            <span className="font-medium text-text">{plural(issues.length, "issue")}</span>
            {acknowledged.length > 0 && <> · {acknowledged.length} acknowledged</>}
            {filtered && " (filtered)"}
            {" · "}
          </>
        ) : null}
        Problems with connections, tracking, spend and budgets, checked after every hourly sync. Each one closes itself when it clears.
      </p>
      <nav className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand font-medium" : "border-transparent text-text-2 hover:text-text"}`}>{t.label}</Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AlertFilters
          types={Object.entries(ALERT_KIND_LABEL)}
          clients={visibleClients.map((c) => [c.id, c.name])}
          labels={labels.map((l) => [l.id, l.name])}
          owners={[["me", "My clients"], ...owners, ["none", "Unassigned"]]}
        />
        {tab === "open" && openIds.length > 1 && <AcknowledgeButton alertIds={openIds} label={`Acknowledge all ${openIds.length} shown`} />}
      </div>

      {alerts.length === 0 ? (
        <Card>
          <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-text-2">
            <CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden />
            {filtered ? "No alerts match these filters." : tab === "resolved" ? "Nothing resolved in the last 14 days." : tab === "snoozed" ? "No snoozed alerts." : "No open alerts. Every monitored account looks healthy."}
          </p>
        </Card>
      ) : (
        <>
          {issues.map((i) => issueCard(i))}
          {tab === "open" && open.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-text-2"><CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden /> Nothing new. Everything open has been acknowledged.</p>
          )}
          {ackIssues.length > 0 && (
            <details className="group rounded-xl border border-border bg-surface">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium hover:bg-surface-2">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
                Acknowledged ({acknowledged.length}) <span className="font-normal text-text-3">· still open; someone is on it</span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-border p-3">{ackIssues.map((i) => issueCard(i, true))}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
