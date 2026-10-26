import Link from "next/link";
import { AlertOctagon, AlertTriangle, BellOff } from "lucide-react";
import { prisma } from "@/server/db";
import type { SessionUser } from "@/lib/access";
import { resolveAlertSettings } from "@/lib/alerts";
import { ALERT_KIND_LABEL, alertFixLink, groupAlertsByCause, visibleAlerts } from "@/lib/alert-groups";
import { AcknowledgeButton } from "@/app/(app)/alerts/buttons";
import { MuteAlertTypeButton } from "./mute-button";

/**
 * Open alerts for one client, for the top of the client Overview (staff only):
 * the top reasons, a fix link per type, acknowledge, mute per client and a link
 * to the full list. Renders nothing when there is nothing open or muted.
 */
export async function ClientAlertsStrip({ clientId, user }: { clientId: string; user: SessionUser }) {
  if (user.role === "CLIENT_USER") return null;
  const now = new Date();
  const [client, raw, agency] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, agencyId: user.agencyId }, select: { mutedAlertTypes: true } }),
    prisma.alert.findMany({
      where: { clientId, agencyId: user.agencyId, status: "OPEN", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
      select: { id: true, type: true, severity: true, clientId: true, accountId: true, message: true, details: true, account: { select: { platform: true, connection: { select: { id: true, platform: true, status: true } } } } },
      orderBy: { firstSeenAt: "desc" },
      take: 200,
    }),
    prisma.agency.findUniqueOrThrow({ where: { id: user.agencyId }, select: { alertSettings: true } }),
  ]);
  if (!client) return null;
  const muted = client.mutedAlertTypes as string[];
  const alerts = visibleAlerts(
    raw.map((a) => ({ ...a, connection: a.account?.connection ?? null, platform: a.account?.platform ?? null })),
    new Map([[clientId, muted]]),
  );
  if (!alerts.length && !muted.length) return null;
  const issues = groupAlertsByCause(alerts, { campaignNoSpendDays: resolveAlertSettings(agency.alertSettings).campaignNoSpendDays });
  const top = issues.slice(0, 3);

  return (
    <section className="rounded-xl border border-border bg-surface" aria-label="Open alerts for this client">
      {alerts.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
            <h2 className="text-sm font-semibold">Open alerts ({alerts.length})</h2>
            <div className="flex items-center gap-2">
              <AcknowledgeButton alertIds={alerts.map((a) => a.id)} label={alerts.length === 1 ? "Acknowledge" : `Acknowledge all ${alerts.length}`} variant="ghost" />
              <Link href={`/alerts?client=${clientId}`} className="text-sm text-brand-text hover:underline">See all</Link>
            </div>
          </div>
          <ul className="divide-y divide-border px-4 pb-1">
            {top.map((issue) => {
              const Icon = issue.severity === "critical" ? AlertOctagon : AlertTriangle;
              const type = issue.alerts[0].type;
              const fix = alertFixLink(type, clientId);
              const single = issue.alerts.length === 1;
              const detail = single ? ((issue.alerts[0].details ?? {}) as { detail?: string }).detail : undefined;
              return (
                <li key={issue.key} className="flex flex-wrap items-start gap-3 py-2.5">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "critical" ? "text-critical-ink" : "text-warning-ink"}`} aria-label={issue.severity === "critical" ? "Critical" : "Warning"} />
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="text-sm font-medium">{single ? issue.alerts[0].message : issue.title}</p>
                    {detail && <p className="text-xs text-text-2">{detail}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Link href={fix.href} className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-brand-text hover:bg-surface-2">{fix.label}</Link>
                    <MuteAlertTypeButton clientId={clientId} type={type} typeLabel={ALERT_KIND_LABEL[type] ?? type} />
                  </div>
                </li>
              );
            })}
          </ul>
          {issues.length > top.length && <p className="px-4 pb-3 text-xs text-text-3">+{issues.length - top.length} more — <Link href={`/alerts?client=${clientId}`} className="text-brand-text hover:underline">see all</Link></p>}
        </>
      )}
      {muted.length > 0 && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs text-text-2 ${alerts.length ? "border-t border-border" : ""}`}>
          <BellOff className="h-3.5 w-3.5 text-text-3" aria-hidden />
          <span>Muted for this client:</span>
          {muted.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              {ALERT_KIND_LABEL[t] ?? t}
              <MuteAlertTypeButton clientId={clientId} type={t} typeLabel={ALERT_KIND_LABEL[t] ?? t} muted />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
