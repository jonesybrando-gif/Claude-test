import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { prisma } from "@/server/db";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { relativeTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/status-badge";
import { AcknowledgeButton, CheckNowButton } from "./buttons";

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
  { key: "resolved", label: "Resolved (14 days)" },
] as const;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireAgencyStaff();
  const { tab = "open" } = await searchParams;
  const clientIds = (await prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true } })).map((c) => c.id);
  const alerts = await prisma.alert.findMany({
    where: {
      agencyId: user.agencyId,
      clientId: { in: clientIds },
      ...(tab === "resolved" ? { status: "RESOLVED", resolvedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } : { status: { in: ["OPEN", "ACKNOWLEDGED"] } }),
    },
    orderBy: [{ severity: "asc" }, { firstSeenAt: "desc" }],
    take: 300,
  });
  const ackers = new Map((await prisma.user.findMany({ where: { id: { in: alerts.map((a) => a.acknowledgedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  // Opening the page marks this person's alert notifications as read.
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });

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
          <Link key={t.key} href={`/alerts?tab=${t.key}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand font-medium" : "border-transparent text-text-2 hover:text-text"}`}>{t.label}</Link>
        ))}
      </nav>
      <Card>
        {alerts.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-text-2">
            <CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden /> {tab === "resolved" ? "Nothing resolved in the last 14 days." : "No open alerts. Every monitored account looks healthy."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => {
              const sev = SEV[(a.severity as keyof typeof SEV) ?? "warning"] ?? SEV.warning;
              const d = (a.details ?? {}) as { detail?: string; clientName?: string; isDemo?: boolean };
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <sev.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${sev.cls}`} aria-label={sev.label} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={a.severity === "critical" ? "critical" : "warning"}>{KIND_LABEL[a.type] ?? a.type}</Badge>
                      {a.clientId && <Link href={`/clients/${a.clientId}`} className="font-medium text-text hover:underline">{d.clientName}</Link>}
                      {d.isDemo && <DemoBadge />}
                      {a.status === "ACKNOWLEDGED" && <Badge variant="neutral">Acknowledged by {ackers.get(a.acknowledgedById ?? "") ?? "someone"}</Badge>}
                    </div>
                    <p className="mt-1 text-sm font-medium">{a.message}</p>
                    {d.detail && <p className="text-sm text-text-2">{d.detail}</p>}
                    <p className="mt-1 text-xs text-text-3">
                      First seen {relativeTime(a.firstSeenAt.toISOString()).toLowerCase()}
                      {a.status === "RESOLVED" && a.resolvedAt ? ` · resolved ${relativeTime(a.resolvedAt.toISOString()).toLowerCase()}` : ` · still true as of ${relativeTime(a.lastSeenAt.toISOString()).toLowerCase()}`}
                    </p>
                  </div>
                  {a.status === "OPEN" && <AcknowledgeButton alertId={a.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
