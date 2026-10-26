"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { PacingSeriesPoint } from "@/lib/pacing/engine";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { ChartSummary, ChartTable } from "./chart-table";

interface Props {
  series: PacingSeriesPoint[];
  budgetMinor: number;
  asOf: string | null;
  currency?: string;
  height?: number;
  /** Dated notes drawn as markers (budget changes, launches). */
  notes?: { date: string; text: string }[];
}

const COLORS = {
  actual: "var(--series-actual)",
  projected: "var(--series-projected)",
  planned: "var(--series-planned)",
};

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="18" height="8" aria-hidden>
      <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
    </svg>
  );
}

function PacingTooltip({ active, payload, currency, notes = [] }: TooltipProps<number, string> & { currency: string; notes?: { date: string; text: string }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PacingSeriesPoint;
  const row = (label: string, color: string, v: number | null, dashed?: boolean) =>
    v === null ? null : (
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-text-2">
          <Swatch color={color} dashed={dashed} /> {label}
        </span>
        <span className="font-medium text-text tabular">{formatMoney(v, currency, { whole: true })}</span>
      </div>
    );
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-text">{formatDate(p.date, { weekday: "short", month: "short", day: "numeric" })}</p>
      {row("Actual (cumulative)", COLORS.actual, p.actualCumulative)}
      {p.actualCumulative === null && row("Projected", COLORS.projected, p.projectedCumulative, true)}
      {row("Planned", COLORS.planned, p.plannedCumulative, true)}
      {p.actualDaily !== null && (
        <div className="mt-1 border-t border-border pt-1 text-text-3">
          Spent this day: <span className="text-text tabular">{formatMoney(p.actualDaily, currency, { whole: true })}</span>
        </div>
      )}
      {notes.filter((n) => n.date === p.date).map((n, i) => (
        <p key={i} className="mt-1 max-w-56 border-t border-border pt-1 text-text">Note: {n.text}</p>
      ))}
    </div>
  );
}

/** Cumulative actual vs cumulative planned spend, with a projection to period end. */
export function PacingChart({ series, budgetMinor, asOf, currency = "USD", height = 280, notes = [] }: Props) {
  const inRange = notes.filter((n) => series.some((p) => p.date === n.date));
  const data = series.map((p) => ({ ...p, label: p.date }));
  const last = series.at(-1);
  const projectedEnd = last?.projectedCumulative ?? last?.actualCumulative ?? null;
  const ticks = series.filter((_, i) => i === 0 || (i + 1) % 7 === 0 || i === series.length - 1).map((p) => p.date);
  const spent = [...series].reverse().find((p) => p.actualCumulative !== null)?.actualCumulative ?? null;
  const summary =
    spent === null
      ? `No spend yet against a budget of ${formatMoney(budgetMinor, currency, { whole: true })}.`
      : `Spent ${formatMoney(spent, currency, { whole: true })} of ${formatMoney(budgetMinor, currency, { whole: true })} so far${projectedEnd !== null && projectedEnd !== spent ? `; on this pace, about ${formatMoney(projectedEnd, currency, { whole: true })} by the end of the period` : ""}.`;
  const maxY = Math.max(budgetMinor, projectedEnd ?? 0, ...series.map((p) => p.actualCumulative ?? 0)) * 1.08;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2" role="list" aria-label="Legend">
        <span role="listitem" className="flex items-center gap-1.5"><Swatch color={COLORS.actual} /> Actual spend</span>
        <span role="listitem" className="flex items-center gap-1.5"><Swatch color={COLORS.planned} dashed /> Planned spend</span>
        <span role="listitem" className="flex items-center gap-1.5"><Swatch color={COLORS.projected} dashed /> Projected</span>
        <span role="listitem" className="flex items-center gap-1.5 text-text-3">— Budget {formatMoney(budgetMinor, currency, { whole: true })}</span>
        {inRange.length > 0 && <span role="listitem" className="flex items-center gap-1.5 text-text-3"><span className="text-[var(--series-projected)]">◆</span> Note</span>}
      </div>
      <ChartSummary text={summary} />
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" ticks={ticks} tickFormatter={(d) => formatDate(d)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis domain={[0, maxY]} tickFormatter={(v) => formatMoneyCompact(v, currency)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<PacingTooltip currency={currency} notes={inRange} />} cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }} />
            <ReferenceLine y={budgetMinor} stroke="var(--text-3)" strokeWidth={1} label={{ value: "Budget", position: "right", fill: "var(--text-2)", fontSize: 11 }} />
            {asOf && <ReferenceLine x={asOf} stroke="var(--border)" strokeWidth={1} label={{ value: "Data through", position: "insideTopLeft", fill: "var(--text-3)", fontSize: 10 }} />}
            {[...new Set(inRange.map((n) => n.date))].map((d) => (
              <ReferenceLine key={d} x={d} stroke="var(--series-projected)" strokeOpacity={0.6} strokeDasharray="2 3" label={{ value: "◆", position: "top", fill: "var(--series-projected)", fontSize: 10 }} />
            ))}
            <Line type="linear" dataKey="plannedCumulative" stroke={COLORS.planned} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="projectedCumulative" stroke={COLORS.projected} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="actualCumulative" stroke={COLORS.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        caption="Cumulative spend by day"
        columns={["Date", "Planned (cumulative)", "Actual (cumulative)", "Projected (cumulative)"]}
        rows={series.map((p) => [
          formatDate(p.date),
          formatMoney(p.plannedCumulative, currency, { whole: true }),
          p.actualCumulative === null ? "—" : formatMoney(p.actualCumulative, currency, { whole: true }),
          p.projectedCumulative === null ? "—" : formatMoney(p.projectedCumulative, currency, { whole: true }),
        ])}
      />
    </div>
  );
}
