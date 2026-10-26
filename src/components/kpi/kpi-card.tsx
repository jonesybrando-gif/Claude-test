import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatKpi, KPI_BY_KEY, kpiChangeWords, type KpiValue } from "@/lib/kpis";
import { InfoTip } from "@/components/ui/info-tip";
import { Sparkline } from "./sparkline";

/** Ratios and costs with no value read "not reported"; counts fall back to KpiCard's own wording. */
export function kpiNote(kv: KpiValue): string | undefined {
  return kv.value === null && KPI_BY_KEY[kv.key].kind !== "count" ? "not reported" : undefined;
}

const TONE = { good: "text-good-ink", bad: "text-critical-ink", neutral: "text-text-2" } as const;

/**
 * The change under a figure in words ("Up 8% from $5,790 · better"), with
 * the arrow and colour as extras, and the full sentence for screen readers.
 */
export function ChangeLine({ tone, changePct, text, aria, className = "" }: { tone: "good" | "bad" | "neutral" | null; changePct: number | null; text: string; aria: string; className?: string }) {
  const showArrow = tone === "good" || tone === "bad";
  const Icon = !showArrow || changePct === null ? Minus : changePct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE[tone ?? "neutral"]}`} aria-hidden />
      <span className={`truncate ${TONE[tone ?? "neutral"]}`} aria-hidden title={text}>{text}</span>
      <span className="sr-only">{aria}</span>
    </span>
  );
}

export function KpiCard({ kv, currency, trend, note, chip }: { kv: KpiValue; currency: string; trend?: (number | null)[]; note?: string; chip?: string }) {
  const def = KPI_BY_KEY[kv.key];
  const words = kpiChangeWords(kv, currency);
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-xs leading-tight text-text-3">
          {def.label}
          <InfoTip label={def.label} text={def.plain} />
        </p>
        {trend && kv.value !== null && <span className="shrink-0"><Sparkline values={trend} width={48} height={18} /></span>}
      </div>
      <p className="flex items-baseline gap-2 truncate text-xl font-semibold tabular">
        {formatKpi(kv.key, kv.value, currency)}
        {chip && <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-warning-ink">{chip}</span>}
      </p>
      <p className="flex min-w-0 items-center gap-1 text-xs tabular">
        {kv.changePct === null || kv.verdict === null ? (
          <span className="text-text-3">{note ?? (kv.value === null ? "not reported" : "no comparison data")}</span>
        ) : (
          <ChangeLine tone={kv.tone} changePct={kv.changePct} text={words.text} aria={words.aria} />
        )}
      </p>
    </div>
  );
}
