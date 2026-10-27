import type { ReactNode } from "react";
import Link from "next/link";
import { describeChange, type ChangeWords } from "@/lib/portfolio";
import { cn } from "@/components/ui/cn";

// Small shared pieces for the client's channel tabs (SEO, Analytics): the
// plain-English lead sentence, a figure with its change, a section card, and
// a "not connected" state. Kept together so the tabs read the same way.

/** A change in words, coloured only when it's clearly better or worse. */
export function change(current: number | null, previous: number | null, better: "up" | "down" | "neutral", format: (n: number) => string, counts?: { current: number; previous: number }): ChangeWords | null {
  if (current === null || previous === null) return null;
  return describeChange({ current, previous, better, format, counts });
}

export function ChangeText({ c, className }: { c: ChangeWords | null; className?: string }) {
  if (!c || c.verdict === "none") return null;
  const tone = c.verdict === "better" ? "text-good-ink" : c.verdict === "worse" ? "text-critical-ink" : "text-text-2";
  return <span className={cn("text-[13px]", tone, className)}>{c.text}</span>;
}

/** The lead sentence of a tab: what happened, in plain words, built from the figures below (not AI-written). */
export function LeadSentence({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <section aria-label="Summary" className="flex flex-col gap-2">
      <p className="max-w-[68ch] text-lg leading-relaxed font-medium tracking-[-0.01em] text-text">
        {children}
      </p>
      {note && <p className="max-w-[75ch] text-sm text-text-2">{note}</p>}
    </section>
  );
}

export function Figure({ label, value, sub, info }: { label: string; value: ReactNode; sub?: ReactNode; info?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-1 max-sm:py-3">
      <p className="text-xs font-medium text-text-2" title={info}>{label}{info && <span className="sr-only">: {info}</span>}</p>
      <p className="text-2xl font-semibold tracking-tight tabular">{value}</p>
      {sub && <div className="min-h-5">{sub}</div>}
    </div>
  );
}

export function FigureRow({ children }: { children: ReactNode }) {
  return <section aria-label="Key figures" className="grid grid-cols-2 rounded-xl border border-border bg-surface py-4 lg:grid-cols-4 [&>*+*]:lg:border-l [&>*+*]:lg:border-border">{children}</section>;
}

export function Section({ title, aside, children, footer }: { title: string; aside?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <div className="text-[13px] text-text-2">{aside}</div>}
      </div>
      {children}
      {footer && <div className="border-t border-border px-5 py-3 text-[13px] text-text-2">{footer}</div>}
    </section>
  );
}

export function NotConnected({ title, body, actions }: { title: string; body: ReactNode; actions: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-8">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="max-w-[65ch] text-sm text-text-2">{body}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className={cn("inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium", a.primary ? "bg-text text-background hover:opacity-90" : "border border-border hover:bg-surface-2")}>{a.label}</Link>
        ))}
      </div>
    </section>
  );
}

/**
 * A table on wider screens and stacked rows on phones, so nothing scrolls
 * sideways. `cells` render the table; `mobile` renders one row's stacked view.
 */
export function ResponsiveRows<T>({ rows, head, cells, mobile, rowKey }: { rows: T[]; head: { label: string; align?: "left" | "right" }[]; cells: (r: T) => ReactNode[]; mobile: (r: T) => ReactNode; rowKey: (r: T) => string }) {
  return (
    <>
      <table className="w-full text-sm max-md:hidden">
        <thead>
          <tr className="border-y border-border text-xs text-text-2">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cn("px-4 py-2.5 font-medium whitespace-nowrap", i === 0 && "pl-5", i === head.length - 1 && "pr-5", h.align === "right" ? "text-right" : "text-left")}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-surface-2">
              {cells(r).map((c, i) => (
                <td key={i} className={cn("px-4 py-3 tabular", i === 0 && "pl-5", i === head.length - 1 && "pr-5", head[i]?.align === "right" ? "text-right" : "text-left")}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-border border-t border-border md:hidden">
        {rows.map((r) => <li key={rowKey(r)} className="px-5 py-3">{mobile(r)}</li>)}
      </ul>
    </>
  );
}
