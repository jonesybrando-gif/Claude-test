"use client";

import { useRef } from "react";
import { cn } from "../ui/cn";

/**
 * "View as table" disclosure under a chart, so every chart's numbers can be
 * read without the chart (screen readers, people who prefer tables).
 * The first column is the row label; the others are right-aligned numbers.
 */
export function ChartTable({ caption, columns, rows, className, overlay = false }: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
  className?: string;
  /** In fixed-height cards: the open table covers the chart (nearest positioned ancestor) instead of pushing it. */
  overlay?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <details className={cn("mt-2 text-xs text-text-2", className)}>
      <summary className="inline-flex min-h-8 cursor-pointer items-center rounded text-text-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">View as table</summary>
      <div className={overlay ? "absolute inset-x-0 top-0 bottom-8 z-10 overflow-auto bg-surface" : "mt-2 max-h-64 overflow-auto"}>
        <table className="w-full tabular">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-text-3">
              {columns.map((c, i) => (
                <th key={c} scope="col" className={cn("py-1 pr-3 font-medium", i > 0 && "text-right")}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-border">
                {r.map((cell, ci) =>
                  ci === 0 ? (
                    <th key={ci} scope="row" className="py-1 pr-3 text-left font-normal">{cell}</th>
                  ) : (
                    <td key={ci} className="py-1 pr-3 text-right">{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** One-line text summary of a chart, read before the chart itself. */
export function ChartSummary({ text, className }: { text: string; className?: string }) {
  return <p className={cn("mb-2 text-xs text-text-2", className)}>{text}</p>;
}

/**
 * Metric switcher for charts: a group of toggle buttons (aria-pressed).
 * Tab reaches each button, Enter/Space choose, and arrow keys move along the group.
 */
export function MetricToggle<K extends string>({ options, value, onChange, label = "Metric", className }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void; label?: string; className?: string }) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const buttons = [...(group.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <div ref={group} role="group" aria-label={label} onKeyDown={onKeyDown} className={cn("flex flex-wrap gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "min-h-8 rounded-md px-2.5 py-1 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
            value === o.key ? "bg-brand/10 font-medium text-text ring-1 ring-brand/50" : "text-text-2 hover:bg-surface-2 hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
