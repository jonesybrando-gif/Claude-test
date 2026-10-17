import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatKpi, KPI_BY_KEY, type KpiValue } from "@/lib/kpis";
import { formatPct } from "@/lib/money";
import { Sparkline } from "./sparkline";

const TONE = { good: "text-good-ink", bad: "text-critical-ink", neutral: "text-text-2" } as const;

export function KpiCard({ kv, currency, trend, note }: { kv: KpiValue; currency: string; trend?: (number | null)[]; note?: string }) {
  const def = KPI_BY_KEY[kv.key];
  const Icon = kv.changePct === null || Math.abs(kv.changePct) < 0.5 ? Minus : kv.changePct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3" title={def.description}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="text-xs leading-tight text-text-3">{def.label}</p>
        {trend && kv.value !== null && <span className="shrink-0"><Sparkline values={trend} width={48} height={18} /></span>}
      </div>
      <p className="truncate text-xl font-semibold tabular">{formatKpi(kv.key, kv.value, currency)}</p>
      <p className="flex items-center gap-1 text-xs tabular">
        {kv.changePct === null ? (
          <span className="text-text-3">{note ?? (kv.value === null ? "not reported" : "no comparison data")}</span>
        ) : (
          <>
            <Icon className={`h-3.5 w-3.5 ${TONE[kv.tone ?? "neutral"]}`} aria-hidden />
            <span className={TONE[kv.tone ?? "neutral"]}>{formatPct(Math.abs(kv.changePct))}</span>
            <span className="text-text-3">vs {formatKpi(kv.key, kv.previous, currency)}</span>
          </>
        )}
      </p>
    </div>
  );
}
