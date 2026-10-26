import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "./ui/cn";

/**
 * One finding as a short card: what kind it is, a headline, one sentence and
 * one link. Observations are worked out from the figures; suggestions are
 * written by AI and look different, so a suggestion is never mistaken for a fact.
 */
export function InsightCard({
  kind,
  eyebrow,
  headline,
  detail,
  action,
  footnote,
  className,
}: {
  kind: "observation" | "suggestion";
  /** Overrides the default type line ("Observation", "Suggested action"). */
  eyebrow?: string;
  headline: string;
  detail?: ReactNode;
  action?: { href: string; label: string };
  footnote?: string;
  className?: string;
}) {
  const suggestion = kind === "suggestion";
  return (
    <article className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface px-5 py-4", className)}>
      <p className={cn("flex items-center gap-1 text-xs font-semibold uppercase tracking-wide", suggestion ? "text-brand-text" : "text-text-2")}>
        {suggestion && <Sparkles className="h-3.5 w-3.5" aria-hidden />}
        {eyebrow ?? (suggestion ? "Suggested action" : "Observation")}
      </p>
      <h3 className="text-base font-semibold leading-snug text-text">{headline}</h3>
      {detail && <p className="text-sm leading-relaxed text-text-2">{detail}</p>}
      {action && (
        <Link href={action.href} className="mt-1 w-fit text-[13px] font-semibold text-brand-text hover:underline">
          {action.label}
        </Link>
      )}
      {footnote && <p className="text-xs text-text-3">{footnote}</p>}
    </article>
  );
}
