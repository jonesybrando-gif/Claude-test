import type { ReactNode } from "react";
import { budgetStatusWords, type BudgetState, type StatusTone } from "@/lib/budget-status";
import { cn } from "./ui/cn";

const DOT: Record<StatusTone, string> = {
  critical: "bg-critical",
  watch: "bg-dot-watch",
  good: "bg-good",
  none: "bg-transparent ring-1 ring-inset ring-text-3/60",
};

/** A small coloured dot. Decorative: the words beside it carry the meaning. */
export function Dot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", DOT[tone], className)} />;
}

/**
 * Status as a dot plus plain words — the one way status is shown on screen.
 * `title` gives the precise state on hover; screen readers read the words and the detail.
 */
export function StatusDot({ tone, children, detail, className }: { tone: StatusTone; children: ReactNode; detail?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-sm text-text", className)} title={detail}>
      <Dot tone={tone} />
      <span>{children}</span>
      {detail && <span className="sr-only">({detail})</span>}
    </span>
  );
}

/** Budget pacing status: On track, Over · +$123, Under · −$962, or a grey state. */
export function BudgetStatus({ state, varianceMinor, currency, className }: { state: BudgetState; varianceMinor?: number | null; currency?: string; className?: string }) {
  const w = budgetStatusWords(state, varianceMinor, currency);
  return (
    <StatusDot tone={w.tone} detail={w.detail} className={className}>
      <span className="tabular">{w.label}</span>
    </StatusDot>
  );
}
