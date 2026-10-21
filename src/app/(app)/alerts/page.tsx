import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { relativeTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DemoBadge } from "@/components/status-badge";
import { LabelBadge } from "@/components/label-badge";
import { AcknowledgeButton, CheckNowButton } from "./buttons";
import { AlertBox, AlertBulkBar, SelectGroup } from "./bulk";
import { bulkAlertAction } from "./actions";

export const dynamic = "force-dynamic";

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

type Sp = { tab?: string; type?: string; client?: string; label?: string; mine?: string };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requireAgencyStaff();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "open";
  const now = new Date();
  const clients = await prisma.client.findMany({
    where: visibleClientsWhere(user),
    select: { id: true, name: true, primaryManagerId: true, primaryManager: { select: { name: true } }, labels: { select: { id: true, name: true, color: true } } },
    orderBy: { name: "asc" },
  });
  const labels = [...new Map(clients.flatMap((c) => c.labels).map((l) => [l.id, l])).values()].sort((a, b) => a.name.localeCompare(b.name));
  // Filters narrow the clients first; "mine" = clients this person owns.
  const inScope = clients.filter(
    (c) => (!sp.client || c.id === sp.client) && (!sp.label || c.labels.some((l) => l.id === sp.label)) && (!sp.mine || c.primaryManagerId === user.id),
  );
  const where: Prisma.AlertWhereInput = {
    agencyId: user.agencyId,
    clientId: { in: inScope.map((c) => c.id) },
    ...(sp.type ? { type: sp.type as Prisma.AlertWhereInput["type"] } : {}),
    ...(tab === "resolved"
      ? { status: "RESOLVED", resolvedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }
      : tab === "snoozed"
        ? { status: { in: ["OPEN", "ACKNOWLEDGED"] }, snoozedUntil: { gt: now } }
        : { status: { in: ["OPEN", "ACKNOWLEDGED"] }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] }),
  };
  const alerts = await prisma.alert.findMany({ where, orderBy: [{ severity: "asc" }, { firstSeenAt: "desc" }], take: 500 });
  const ackers = new Map((await prisma.user.findMany({ where: { id: { in: alerts.map((a) => a.acknowledgedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Opening the page marks this person's alert notifications as read.
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });

  // One group per client, most urgent first.
  const byClient = new Map<string, typeof alerts>();
  for (const a of alerts) byClient.set(a.clientId ?? "", [...(byClient.get(a.clientId ?? "") ?? []), a]);
  const groups = [...byClient.entries()]
    .map(([clientId, list]) => ({ client: clients.find((c) => c.id === clientId), list, critical: list.filter((a) => a.severity === "critical").length }))
    .sort((a, b) => b.critical - a.critical || b.list.length - a.list.length);
  const qs = (patch: Partial<Sp>) => `/alerts?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const filtered = !!(sp.type || sp.client || sp.label || sp.mine);

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
          <Link key={t.key} href={qs({ tab: t.key === "open" ? undefined : t.key })} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand font-medium" : "border-transparent text-text-2 hover:text-text"}`}>{t.label}</Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {tab !== "open" && <input type="hidden" name="tab" value={tab} />}
        <Select name="type" defaultValue={sp.type ?? ""} className="w-full sm:w-48" aria-label="Alert type">
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="client" defaultValue={sp.client ?? ""} className="w-full sm:w-52" aria-label="Client">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {labels.length > 0 && (
          <Select name="label" defaultValue={sp.label ?? ""} className="w-full sm:w-44" aria-label="Label">
            <option value="">All labels</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} className="h-4 w-4 accent-[var(--brand)]" /> My clients
        </label>
        <Button type="submit" size="sm" variant="outline">Filter</Button>
        {filtered && <Link href={qs({ type: undefined, client: undefined, label: undefined, mine: undefined })} className="text-sm text-text-2 hover:underline">Clear</Link>}
        <span className="ml-auto text-xs text-text-3">{alerts.length} alert{alerts.length === 1 ? "" : "s"} · {groups.length} client{groups.length === 1 ? "" : "s"}</span>
      </form>

      {tab !== "resolved" && alerts.length > 0 && <AlertBulkBar action={bulkAlertAction} snoozedView={tab === "snoozed"} />}

      {alerts.length === 0 && (
        <Card>
          <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-text-2">
            <CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden />
            {filtered ? "No alerts match these filters." : tab === "resolved" ? "Nothing resolved in the last 14 days." : tab === "snoozed" ? "Nothing is snoozed." : "No open alerts. Every monitored account looks healthy."}
          </p>
        </Card>
      )}

      {groups.map(({ client, list, critical }) => (
        <Card key={client?.id ?? "none"}>
          <section>
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              {tab !== "resolved" && <SelectGroup label={client?.name ?? "client"} />}
              {client ? <Link href={`/clients/${client.id}`} className="font-semibold hover:underline">{client.name}</Link> : <span className="font-semibold">Agency</span>}
              {client?.labels.map((l) => <LabelBadge key={l.id} label={l} />)}
              <span className="text-xs text-text-3">
                {list.length} alert{list.length === 1 ? "" : "s"}{critical > 0 && ` · ${critical} critical`} · Owner: {client?.primaryManager?.name ?? "unassigned"}
              </span>
            </header>
            <ul className="divide-y divide-border">
              {list.map((a) => {
                const sev = SEV[(a.severity as keyof typeof SEV) ?? "warning"] ?? SEV.warning;
                const d = (a.details ?? {}) as { detail?: string; isDemo?: boolean };
                // Titles are "subject: what happened"; show the subject quietly so every alert reads the same way.
                const cut = a.message.indexOf(": ");
                const subject = cut > 0 ? a.message.slice(0, cut) : null;
                const headline = cut > 0 ? a.message.slice(cut + 2) : a.message;
                return (
                  <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    {tab !== "resolved" && <AlertBox id={a.id} label={a.message} />}
                    <sev.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${sev.cls}`} aria-label={sev.label} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={a.severity === "critical" ? "critical" : "warning"}>{KIND_LABEL[a.type] ?? a.type}</Badge>
                        {subject && <span className="text-text-2">{subject}</span>}
                        {d.isDemo && <DemoBadge />}
                        {a.status === "ACKNOWLEDGED" && <Badge variant="neutral">Acknowledged by {ackers.get(a.acknowledgedById ?? "") ?? "someone"}</Badge>}
                        {a.snoozedUntil && a.snoozedUntil > now && <Badge variant="neutral">Snoozed until {a.snoozedUntil.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge>}
                      </div>
                      <p className="mt-1 text-sm font-medium">{headline.charAt(0).toUpperCase() + headline.slice(1)}</p>
                      {d.detail && <p className="text-sm text-text-2">{d.detail}</p>}
                      <p className="mt-1 text-xs text-text-3">
                        First seen {relativeTime(a.firstSeenAt.toISOString()).toLowerCase()}
                        {a.status === "RESOLVED" && a.resolvedAt ? ` · resolved ${relativeTime(a.resolvedAt.toISOString()).toLowerCase()}` : ` · still true as of ${relativeTime(a.lastSeenAt.toISOString()).toLowerCase()}`}
                      </p>
                    </div>
                    {a.status === "OPEN" && tab === "open" && <AcknowledgeButton alertId={a.id} />}
                  </li>
                );
              })}
            </ul>
          </section>
        </Card>
      ))}
    </div>
  );
}
