import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatKpi, KPI_BY_KEY, kpiChangeWords, type KpiValue } from "@/lib/kpis";
import { MetricCard } from "@/components/ui/metric-card";
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
    <MetricCard
      size="md"
      label={def.label}
      info={def.plain}
      value={formatKpi(kv.key, kv.value, currency)}
      chip={chip}
      aside={trend && kv.value !== null ? <Sparkline values={trend} width={48} height={18} /> : undefined}
      change={
        kv.changePct === null || kv.verdict === null ? (
          <span className="text-text-3">{note ?? (kv.value === null ? "not reported" : "no comparison data")}</span>
        ) : (
          <ChangeLine tone={kv.tone} changePct={kv.changePct} text={words.text} aria={words.aria} className="max-w-full" />
        )
      }
    />
  );
}
