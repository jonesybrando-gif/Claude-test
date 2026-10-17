"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { PacingSeriesPoint } from "@/lib/pacing/engine";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate } from "@/lib/time";

interface Props {
  series: PacingSeriesPoint[];
  budgetMinor: number;
  asOf: string | null;
  currency?: string;
  height?: number;
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

function PacingTooltip({ active, payload, currency }: TooltipProps<number, string> & { currency: string }) {
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
    </div>
  );
}

/** Cumulative actual vs cumulative planned spend, with a projection to period end. */
export function PacingChart({ series, budgetMinor, asOf, currency = "USD", height = 280 }: Props) {
  const data = series.map((p) => ({ ...p, label: p.date }));
  const last = series.at(-1);
  const projectedEnd = last?.projectedCumulative ?? last?.actualCumulative ?? null;
  const ticks = series.filter((_, i) => i === 0 || (i + 1) % 7 === 0 || i === series.length - 1).map((p) => p.date);
  const maxY = Math.max(budgetMinor, projectedEnd ?? 0, ...series.map((p) => p.actualCumulative ?? 0)) * 1.08;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2" role="list" aria-label="Legend">
        <span role="listitem" className="flex items-center gap-1.5"><Swatch color={COLORS.actual} /> Actual spend</span>
        <span role="listitem" className="flex items-center gap-1.5"><Swatch color={COLORS.planned} dashed /> Planned spend</span>
        <span role="listitem" className="flex items-center gap-1.5"><Swatch color={COLORS.projected} dashed /> Projected</span>
        <span role="listitem" className="flex items-center gap-1.5 text-text-3">— Budget {formatMoney(budgetMinor, currency, { whole: true })}</span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 64, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" ticks={ticks} tickFormatter={(d) => formatDate(d)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis domain={[0, maxY]} tickFormatter={(v) => formatMoneyCompact(v, currency)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
            <Tooltip content={<PacingTooltip currency={currency} />} cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }} />
            <ReferenceLine y={budgetMinor} stroke="var(--text-3)" strokeWidth={1} label={{ value: "Budget", position: "right", fill: "var(--text-2)", fontSize: 11 }} />
            {asOf && <ReferenceLine x={asOf} stroke="var(--border)" strokeWidth={1} label={{ value: "Data through", position: "insideTopLeft", fill: "var(--text-3)", fontSize: 10 }} />}
            <Line type="linear" dataKey="plannedCumulative" stroke={COLORS.planned} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="linear" dataKey="projectedCumulative" stroke={COLORS.projected} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="actualCumulative" stroke={COLORS.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-text-2">
        <summary className="cursor-pointer text-text-3">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full tabular">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Planned (cum.)</th>
                <th className="py-1 pr-3 font-medium">Actual (cum.)</th>
                <th className="py-1 font-medium">Projected (cum.)</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="py-1 pr-3">{formatDate(p.date)}</td>
                  <td className="py-1 pr-3">{formatMoney(p.plannedCumulative, currency, { whole: true })}</td>
                  <td className="py-1 pr-3">{p.actualCumulative === null ? "—" : formatMoney(p.actualCumulative, currency, { whole: true })}</td>
                  <td className="py-1">{p.projectedCumulative === null ? "—" : formatMoney(p.projectedCumulative, currency, { whole: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
