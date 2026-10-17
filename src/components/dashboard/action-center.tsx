import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { PacingRow } from "@/server/pacing-service";
import type { ActionSeverity } from "@/lib/action-center";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const ICON: Record<ActionSeverity, { Icon: typeof Info; cls: string; label: string }> = {
  critical: { Icon: AlertOctagon, cls: "text-critical-ink", label: "Action needed" },
  warning: { Icon: AlertTriangle, cls: "text-warning-ink", label: "Watch" },
  info: { Icon: Info, cls: "text-info-ink", label: "Info" },
  ok: { Icon: CheckCircle2, cls: "text-good-ink", label: "OK" },
};
const ORDER: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };

export function ActionCenter({ rows, limit = 8 }: { rows: PacingRow[]; limit?: number }) {
  const sorted = [...rows].sort(
    (a, b) => ORDER[a.action.severity] - ORDER[b.action.severity] || Math.abs(b.result?.projectedVarianceMinor ?? 0) - Math.abs(a.result?.projectedVarianceMinor ?? 0),
  );
  const actionable = sorted.filter((r) => r.action.severity !== "ok");
  const okCount = sorted.length - actionable.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Action Center</CardTitle>
        <CardDescription>What to change today. Recommendations only — budgets are never changed automatically.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-0 pb-2">
        {actionable.slice(0, limit).map((r) => {
          const { Icon, cls, label } = ICON[r.action.severity];
          return (
            <Link key={r.key} href={`/clients/${r.clientId}`} className="flex gap-3 px-5 py-2.5 hover:bg-surface-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} aria-label={label} />
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{r.clientName}</span>
                  <span className="text-text-3"> · {r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}</span>
                </p>
                <p className="text-sm text-text">{r.action.headline}</p>
                <p className="text-xs text-text-2">{r.action.detail}</p>
              </div>
            </Link>
          );
        })}
        {actionable.length > limit && <p className="px-5 py-1 text-xs text-text-3">+{actionable.length - limit} more in the table below</p>}
        {okCount > 0 && (
          <p className="flex items-center gap-2 px-5 py-2 text-xs text-text-2">
            <CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden /> {okCount} budget line{okCount === 1 ? "" : "s"} on target — no action required.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
