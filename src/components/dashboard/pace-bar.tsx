import type { PacingStatus } from "@/lib/pacing/status";
import { formatPct } from "@/lib/money";

const FILL: Record<PacingStatus, string> = {
  OVERSPENDING: "var(--critical)",
  SLIGHTLY_OVER: "var(--serious)",
  ON_TARGET: "var(--good)",
  SLIGHTLY_UNDER: "var(--warning)",
  UNDERSPENDING: "var(--warning)",
  NOT_STARTED: "var(--text-3)",
  NO_BUDGET: "var(--text-3)",
};

/**
 * Bar = share of monthly budget consumed. Tick = where spend should be today
 * (expected ÷ budget). A fill past the tick is overpacing; short of it is
 * underpacing. Status is also shown as a labelled badge, so color is not the
 * only signal.
 */
export function PaceBar({ consumed, elapsed, expected, status }: { consumed: number; elapsed: number; expected: number; status: PacingStatus }) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <div className="flex flex-col gap-1" aria-label={`${formatPct(consumed, 0)} of budget used, ${formatPct(elapsed, 0)} of period elapsed`}>
      <div className="relative h-2 w-full rounded-full bg-track">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamp(consumed)}%`, background: FILL[status] }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-text" style={{ left: `calc(${clamp(expected)}% - 1px)` }} aria-hidden />
        {consumed > 100 && <div className="absolute inset-y-0 right-0 w-1 rounded-r-full bg-critical-ink" aria-hidden />}
      </div>
      <div className="flex justify-between text-xs text-text-3 tabular">
        <span><span className="text-text-2">{formatPct(consumed, 0)}</span> used</span>
        <span>{formatPct(elapsed, 0)} of month</span>
      </div>
    </div>
  );
}
