import Link from "next/link";
import type { ReactNode } from "react";
import { InfoTip } from "./info-tip";
import { cn } from "./cn";

/**
 * The one metric tile: a label (with an optional ⓘ definition), a large value
 * and one change line. Every page uses it, so a figure looks the same
 * wherever it appears. Definitions go in `info`, never as a line under the value.
 */
export function MetricCard({
  label,
  info,
  value,
  change,
  chip,
  extra,
  aside,
  href,
  size = "lg",
  valueTone,
  className,
  ariaLabel,
}: {
  label: ReactNode;
  /** Plain-English definition, shown from the ⓘ button. */
  info?: string;
  value: ReactNode;
  /** One short line under the value: a change, or a note when there is nothing to compare. */
  change?: ReactNode;
  /** A small qualifier beside the value ("Estimated"). */
  chip?: string;
  /** Anything that must sit inside the card below the change line (kept rare). */
  extra?: ReactNode;
  /** Top-right content, e.g. a sparkline. */
  aside?: ReactNode;
  /** Makes the whole card a link. */
  href?: string;
  /** "lg" for the four headline cards on a page; "md" for denser grids. */
  size?: "lg" | "md";
  valueTone?: "critical" | "good";
  className?: string;
  ariaLabel?: string;
}) {
  const labelText = typeof label === "string" ? label : undefined;
  const body = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1 text-[13px] font-medium leading-tight text-text-2">
          <span className="truncate">{label}</span>
          {info && <InfoTip label={labelText ?? "this figure"} text={info} />}
        </p>
        {aside && <span className="shrink-0">{aside}</span>}
      </div>
      <p
        className={cn(
          "mt-2 flex min-w-0 flex-wrap items-baseline gap-2 font-semibold tracking-tight tabular",
          size === "lg" ? "text-[26px] leading-8 md:text-[30px] md:leading-9" : "text-2xl leading-8",
          valueTone === "critical" ? "text-critical-ink" : valueTone === "good" ? "text-good-ink" : "text-text",
        )}
      >
        <span className="truncate">{value}</span>
        {chip && <span className="rounded bg-warning-bg px-1.5 py-0.5 text-xs font-medium tracking-normal text-warning-ink">{chip}</span>}
      </p>
      {change && <div className="mt-1.5 min-w-0 text-[13px] leading-snug tabular">{change}</div>}
      {extra}
    </>
  );
  const box = cn("flex min-w-0 flex-col rounded-xl border border-border bg-surface", size === "lg" ? "px-5 py-4" : "px-4 py-3.5", className);
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={cn(box, "hover:border-text-3/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring")}>
        {body}
      </Link>
    );
  }
  return (
    <div className={box} aria-label={ariaLabel} role={ariaLabel ? "group" : undefined}>
      {body}
    </div>
  );
}
