import type { ReactNode } from "react";
import { cn } from "./cn";

const TONE = {
  info: "bg-info-ink",
  warning: "bg-dot-watch",
  critical: "bg-critical",
  neutral: "bg-text-3",
} as const;

/**
 * One-line notice (a reminder, a lost connection, mixed currencies): a dot, a
 * short sentence and at most one action. The one style for page-level notes.
 */
export function Banner({ tone = "neutral", children, action, className, role = "note" }: { tone?: keyof typeof TONE; children: ReactNode; action?: ReactNode; className?: string; role?: "note" | "status" | "alert" }) {
  return (
    <div role={role} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text", className)}>
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", TONE[tone])} />
      <div className="min-w-0 flex-1 basis-64">{children}</div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
