import Link from "next/link";
import type { AlertType, Prisma } from "@prisma/client";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { relativeTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/status-badge";
import { LabelBadge } from "@/components/label-badge";
import { AcknowledgeButton, AlertFilters, CheckNowButton, SnoozeControl } from "./buttons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

const KIND_LABEL: Record<string, string> = {
  OVERSPENDING: "Overspending",
  UNDERSPENDING: "Underspending",
  PROJECTED_OVERRUN: "Projected overrun",
  SPEND_SPIKE: "Spend spike",
  SPEND_STOPPED: "Spend stopped",
  CAMPAIGN_NO_SPEND: "Campaign not spending",
  SYNC_FAILED: "Data sync",
  ACCOUNT_DISCONNECTED: "Disconnected",
};

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

type Sp = { tab?: string; type?: string; client?: string; label?: string; owner?: string };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireAgencyStaff();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "open";
  const now = new Date();
  const [visibleClients, labels] = await Promise.all([
    prisma.client.findMany({
      where: visibleClientsWhere(user),
      select: { id: true, name: true, primaryManager: { select: { id: true, name: true } }, labels: { select: { id: true, name: true, color: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.clientLabel.findMany({ where: { agencyId: user.agencyId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
  const alerts = await prisma.alert.findMany({
    where: { agencyId: user.agencyId, clientId: { in: clientIds }, ...(sp.type && sp.type in KIND_LABEL ? { type: sp.type as AlertType } : {}), ...statusWhere },
    orderBy: [{ severity: "asc" }, { firstSeenAt: "desc" }],
    take: 500,
  });
  const ackers = new Map((await prisma.user.findMany({ where: { id: { in: alerts.map((a) => a.acknowledgedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Opening the page marks this person's alert notifications as read.
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });

  // Group by client, most urgent client first.
  const byClient = new Map<string, typeof alerts>();
  for (const a of alerts) byClient.set(a.clientId ?? "", [...(byClient.get(a.clientId ?? "") ?? []), a]);
  const groups = [...byClient.entries()]
    .map(([clientId, items]) => ({ clientId, client: clientById.get(clientId), items, critical: items.filter((a) => a.severity === "critical").length }))
    .sort((a, b) => b.critical - a.critical || b.items.length - a.items.length || (a.client?.name ?? "").localeCompare(b.client?.name ?? ""));
  const openIds = alerts.filter((a) => a.status === "OPEN").map((a) => a.id);
  const owners = [...new Map(visibleClients.filter((c) => c.primaryManager).map((c) => [c.primaryManager!.id, c.primaryManager!.name])).entries()].filter(([id]) => id !== user.id).sort((a, b) => a[1].localeCompare(b[1]));
  const tabHref = (key: string) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "tab") as [string, string][]);
    if (key !== "open") q.set("tab", key);
    return `/alerts${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alerts</h1>
          <p className="text-sm text-text-2">Checked after every hourly sync. Each issue alerts once and closes itself when it clears.</p>
        </div>
        {user.role === "AGENCY_ADMIN" && <CheckNowButton />}
      </div>
      <nav className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand font-medium" : "border-transparent text-text-2 hover:text-text"}`}>{t.label}</Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AlertFilters
          types={Object.entries(KIND_LABEL)}
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
            {sp.type || sp.client || sp.label || sp.owner ? "No alerts match these filters." : tab === "resolved" ? "Nothing resolved in the last 14 days." : tab === "snoozed" ? "No snoozed alerts." : "No open alerts. Every monitored account looks healthy."}
          </p>
        </Card>
      ) : (
        groups.map((g) => {
          const groupOpen = g.items.filter((a) => a.status === "OPEN").map((a) => a.id);
          return (
            <Card key={g.clientId}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {g.client ? <Link href={`/clients/${g.clientId}`} className="font-semibold hover:underline">{g.client.name}</Link> : <span className="font-semibold">Unknown client</span>}
                  <span className="text-xs text-text-3">
                    {g.items.length} alert{g.items.length === 1 ? "" : "s"}
                    {g.critical > 0 && ` · ${g.critical} critical`}
                    {" · "}Owner: {g.client?.primaryManager?.name ?? "unassigned"}
                  </span>
                  {g.client?.labels.map((l) => <LabelBadge key={l.id} label={l} />)}
                </div>
                {tab !== "resolved" && (
                  <div className="flex items-center gap-2">
                    {tab === "open" && groupOpen.length > 1 && <AcknowledgeButton alertIds={groupOpen} label={`Acknowledge all ${groupOpen.length}`} variant="ghost" />}
                    {g.items.length > 1 && <SnoozeControl alertIds={g.items.map((a) => a.id)} snoozed={tab === "snoozed"} label="Snooze all" />}
                  </div>
                )}
              </div>
              <ul className="divide-y divide-border">
                {g.items.map((a) => {
                  // Underspending is amber, never red: red is kept for overspending and broken connections.
                  const sev = a.type === "UNDERSPENDING" ? SEV.warning : SEV[(a.severity as keyof typeof SEV) ?? "warning"] ?? SEV.warning;
                  const d = (a.details ?? {}) as { detail?: string; clientName?: string; isDemo?: boolean };
                  return (
                    <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                      <sev.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${sev.cls}`} aria-label={sev.label} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={a.severity === "critical" && a.type !== "UNDERSPENDING" ? "critical" : "warning"}>{KIND_LABEL[a.type] ?? a.type}</Badge>
                          {d.isDemo && <DemoBadge />}
                          {a.status === "ACKNOWLEDGED" && <Badge variant="neutral">Acknowledged by {ackers.get(a.acknowledgedById ?? "") ?? "someone"}</Badge>}
                          {tab === "snoozed" && a.snoozedUntil && <Badge variant="neutral">Snoozed until {a.snoozedUntil.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge>}
                        </div>
                        <p className="mt-1 text-sm font-medium">{a.message}</p>
                        {d.detail && <p className="text-sm text-text-2">{d.detail}</p>}
                        <p className="mt-1 text-xs text-text-3">
                          First seen {relativeTime(a.firstSeenAt.toISOString()).toLowerCase()}
                          {a.status === "RESOLVED" && a.resolvedAt ? ` · resolved ${relativeTime(a.resolvedAt.toISOString()).toLowerCase()}` : ` · still true as of ${relativeTime(a.lastSeenAt.toISOString()).toLowerCase()}`}
                        </p>
                      </div>
                      {a.status !== "RESOLVED" && (
                        <div className="flex items-center gap-2">
                          {a.status === "OPEN" && <AcknowledgeButton alertIds={[a.id]} />}
                          <SnoozeControl alertIds={[a.id]} snoozed={tab === "snoozed"} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
