"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Plug } from "lucide-react";
import { formatMetric } from "@/lib/dashboards/metrics";
import { widgetTitle } from "@/lib/dashboards/describe";
import type { DashboardWidget } from "@/lib/dashboards/types";
import type { WidgetData } from "@/lib/dashboards/widget-data";
import { formatPct } from "@/lib/money";
import { SeriesChart } from "@/components/charts/series-chart";
import { BreakdownBarChart, MetricPieChart } from "@/components/charts/breakdown-charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/ui/cn";
import { TextContent } from "./text-content";

const TONE = { good: "text-good-ink", bad: "text-critical-ink", neutral: "text-text-2" } as const;

/** Server-rendered ad sections (budget pacing, campaign table) reused as widgets. */
export interface AdSlots {
  pacing?: ReactNode;
  campaigns?: ReactNode;
}

export interface WidgetViewProps {
  widget: DashboardWidget;
  /** undefined while loading (editor previews). */
  data: WidgetData | undefined;
  currency: string;
  slots?: AdSlots;
  /** Staff get a "Connect" link on not-connected empty states. */
  staff?: boolean;
  /** "grid": fill the grid cell on tablets and up, natural height on phones. "always": fill the parent (editor). */
  fill?: "grid" | "always";
}

/** One widget as it appears on a dashboard: a card with its title and content. */
export function WidgetView({ widget, data, currency, slots, staff = false, fill = "grid" }: WidgetViewProps) {
  const title = widgetTitle(widget);
  const fillCls = fill === "always" ? "h-full overflow-hidden" : "md:h-full";
  if ((widget.kind === "pacing" || widget.kind === "campaigns") && data?.kind === widget.kind) {
    const slot = slots?.[widget.kind];
    return <div className={cn("flex flex-col gap-3", fill === "always" ? "h-full overflow-hidden" : "md:h-full md:overflow-auto")}>{slot ?? <Placeholder text="Shown with the client's data." />}</div>;
  }
  if (widget.kind === "kpi" && data?.kind === "kpi") return <KpiWidget title={title} data={data} currency={currency} fillCls={fillCls} />;
  const chart = widget.kind === "line" || widget.kind === "bar" || widget.kind === "pie";
  return (
    <section aria-label={title || "Note"} className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-surface", chart && fill === "grid" && "h-72", fillCls, widget.kind === "text" && "border-transparent bg-transparent")}>
      {title && (
        <header className="px-4 pt-3 pb-2">
          <h3 className="truncate text-sm font-semibold" title={title}>{title}</h3>
        </header>
      )}
      <div className={cn("min-h-0 flex-1 px-4 pb-3", !title && "pt-3", (widget.kind === "table" || widget.kind === "rankings") && "overflow-auto px-0", widget.kind === "text" && "overflow-auto")}>
        <WidgetBody widget={widget} data={data} currency={currency} staff={staff} />
      </div>
    </section>
  );
}

function WidgetBody({ widget, data, currency, staff }: { widget: DashboardWidget; data: WidgetData | undefined; currency: string; staff: boolean }) {
  if (widget.kind === "text") return <TextContent text={widget.text ?? ""} />;
  if (!data) return <Skeleton className="h-full min-h-16 w-full" />;
  if (data.kind === "empty") return <EmptyState data={data} staff={staff} />;
  switch (data.kind) {
    case "series":
      return <SeriesChart dates={data.dates} metrics={data.metrics} current={data.current} previous={data.previous} previousDates={data.previousDates} currency={currency} type={widget.kind === "bar" ? "bar" : "line"} />;
    case "breakdown":
      if (widget.kind === "pie") return <MetricPieChart rows={data.rows} metric={data.metrics[0]} currency={currency} />;
      if (widget.kind === "bar") return <BreakdownBarChart rows={data.rows} metric={data.metrics[0]} currency={currency} />;
      return (
        <Table>
          <THead>
            <tr>
              <TH className="pl-4">{data.dimensionLabel}</TH>
              {data.metrics.map((m, i) => <TH key={m.key} className={cn("text-right", i === data.metrics.length - 1 && "pr-4")}>{m.short}</TH>)}
            </tr>
          </THead>
          <TBody>
            {data.rows.map((r, ri) => (
              <TR key={`${r.label}-${ri}`}>
                <TD className="max-w-72 truncate pl-4" title={r.label}>{r.label}</TD>
                {data.metrics.map((m, i) => <TD key={m.key} className={cn("text-right", i === data.metrics.length - 1 && "pr-4")}>{formatMetric(m, r.values[m.key], currency)}</TD>)}
              </TR>
            ))}
          </TBody>
        </Table>
      );
    case "rankings":
      return (
        <Table>
          <THead>
            <tr>
              <TH className="pl-4">Keyword</TH>
              <TH className="text-right">Position</TH>
              {data.hasComparison && <TH className="text-right">Change</TH>}
              <TH className="pr-4">Ranking page</TH>
            </tr>
          </THead>
          <TBody>
            {data.rows.map((r) => {
              const change = r.position !== null && r.previous !== null ? r.previous - r.position : null;
              return (
                <TR key={`${r.keyword}-${r.location ?? ""}`}>
                  <TD className="max-w-64 truncate pl-4" title={r.keyword}>{r.keyword}{r.location && <span className="block text-xs text-text-3">{r.location}</span>}</TD>
                  <TD className="text-right font-medium">{r.position === null ? "—" : r.position}</TD>
                  {data.hasComparison && (
                    <TD className={cn("text-right", change === null || change === 0 ? "text-text-3" : change > 0 ? "text-good-ink" : "text-critical-ink")}>
                      {change === null ? (r.previous === null && r.position !== null ? "new" : "—") : change === 0 ? "0" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}`}
                    </TD>
                  )}
                  <TD className="max-w-64 truncate pr-4 text-xs text-text-3" title={r.url ?? undefined}>{r.url ? r.url.replace(/^https?:\/\/(www\.)?/, "") : "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      );
    default:
      return null;
  }
}

function KpiWidget({ title, data, currency, fillCls }: { title: string; data: Extract<WidgetData, { kind: "kpi" }>; currency: string; fillCls: string }) {
  const Icon = data.changePct === null || Math.abs(data.changePct) < 0.5 ? Minus : data.changePct > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = TONE[data.tone ?? "neutral"];
  return (
    <section aria-label={title} title={data.metric.description} className={cn("flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3", fillCls)}>
      <h3 className="truncate text-xs leading-tight text-text-3">{title}</h3>
      <p className="truncate text-xl font-semibold tabular">{formatMetric(data.metric, data.value, currency)}</p>
      <p className="flex items-center gap-1 text-xs tabular">
        {data.changePct === null ? (
          <span className="text-text-3">{data.value === null ? "not reported" : data.hasComparison ? "no comparison data" : "no comparison"}</span>
        ) : (
          <>
            <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
            <span className={tone}>{formatPct(Math.abs(data.changePct))}</span>
            <span className="truncate text-text-3">vs {formatMetric(data.metric, data.previous, currency)}</span>
          </>
        )}
      </p>
      <FluidSparkline values={data.spark} />
    </section>
  );
}

/** A sparkline that stretches to the card's width and remaining height. */
function FluidSparkline({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null && Number.isFinite(p.v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map((p) => p.v));
  const span = Math.max(...pts.map((p) => p.v)) - min || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * 100;
  const y = (v: number) => 28 - ((v - min) / span) * 26;
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-auto h-6 min-h-6 w-full md:h-auto md:max-h-16 md:flex-1" aria-hidden>
      <path d={d} fill="none" stroke="var(--series-actual)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function EmptyState({ data, staff }: { data: Extract<WidgetData, { kind: "empty" }>; staff: boolean }) {
  const connect = data.reason === "not_connected";
  const href = data.source === "ads" ? null : "/integrations";
  return (
    <div className="flex h-full min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-4 text-center">
      {connect && <Plug className="h-4 w-4 text-text-3" aria-hidden />}
      <p className="text-xs text-text-2">{connect && !staff ? "Not connected yet" : data.message}</p>
      {connect && staff && href && <Link href={href} className="text-xs font-medium text-brand hover:underline">Go to Integrations</Link>}
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-border text-xs text-text-3">{text}</div>;
}
