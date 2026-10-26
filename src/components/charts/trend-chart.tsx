"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { DailyMetrics } from "@/server/reporting";
import { dailyKpiValue, formatKpi, KPI_BY_KEY, type KpiKey } from "@/lib/kpis";
import { formatMoneyCompact, formatNumber, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { addInto, emptyTotals } from "@/lib/metrics";
import { isAdditiveMetric, summarizeSeries } from "@/lib/chart-summary";
import { ChartSummary, ChartTable, MetricToggle } from "./chart-table";

const DEFAULT_METRICS: KpiKey[] = ["spend", "conversions", "leads", "costPerLead", "clicks", "impressions", "conversionRate"];

export function TrendChart({ current, comparison, currency = "USD", metrics = DEFAULT_METRICS, notes = [] }: { current: DailyMetrics[]; comparison: DailyMetrics[] | null; currency?: string; metrics?: KpiKey[]; notes?: { date: string; text: string }[] }) {
  const inRange = notes.filter((n) => current.some((d) => d.date === n.date));
  const [metric, setMetric] = useState<KpiKey>(metrics[0] ?? "spend");
  const m = KPI_BY_KEY[metrics.includes(metric) ? metric : metrics[0] ?? "spend"];
  const fmt = (v: number | null, axis = false) => {
    if (!axis) return formatKpi(m.key, v, currency);
    if (v === null) return "";
    return m.kind === "money" ? formatMoneyCompact(v, currency) : m.kind === "pct" ? formatPct(v, 1) : m.kind === "ratio" ? `${v.toFixed(1)}×` : formatNumber(v, v < 10 && v % 1 ? 1 : 0);
  };
  // Comparison is aligned by day offset (day 1 vs day 1).
  const data = current.map((d, i) => ({
    date: d.date,
    current: dailyKpiValue(d, m.key),
    previous: comparison?.[i] ? dailyKpiValue(comparison[i], m.key) : null,
    previousDate: comparison?.[i]?.date ?? null,
  }));
  // Whole-period values from summed totals, so rates (cost per lead…) are exact, not averages of days.
  const periodValue = (rows: DailyMetrics[]) => m.value(rows.reduce((t, d) => addInto(t, d), emptyTotals()));
  const summary = summarizeSeries({
    label: m.label,
    dates: data.map((d) => d.date),
    values: data.map((d) => d.current),
    previous: comparison ? data.map((d) => d.previous) : null,
    period: { current: periodValue(current), previous: comparison?.length ? periodValue(comparison) : null },
    additive: isAdditiveMetric(m.key),
    count: m.kind === "count",
    format: (v) => fmt(v),
  });

  function Tip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
        <div className="flex justify-between gap-4"><span className="text-text-2">{formatDate(p.date)}</span><span className="font-medium tabular">{fmt(p.current)}</span></div>
        {p.previousDate && <div className="flex justify-between gap-4"><span className="text-text-3">{formatDate(p.previousDate)}</span><span className="tabular text-text-2">{fmt(p.previous)}</span></div>}
        {inRange.filter((n) => n.date === p.date).map((n, i) => <p key={i} className="mt-1 max-w-56 border-t border-border pt-1 text-text">Note: {n.text}</p>)}
      </div>
    );
  }

  return (
    <div>
      <MetricToggle className="mb-3" options={metrics.map((k) => ({ key: k, label: KPI_BY_KEY[k].label }))} value={m.key} onChange={setMetric} />
      <ChartSummary text={summary} />
      {comparison && (
        <div className="mb-2 flex gap-4 text-xs text-text-2">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--series-actual)]" /> Selected period</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[var(--series-planned)]" /> Comparison period</span>
        </div>
      )}
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v) => fmt(v, true)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }} />
            {[...new Set(inRange.map((n) => n.date))].map((d) => (
              <ReferenceLine key={d} x={d} stroke="var(--series-projected)" strokeOpacity={0.6} strokeDasharray="2 3" label={{ value: "◆", position: "top", fill: "var(--series-projected)", fontSize: 10 }} />
            ))}
            {comparison && <Line dataKey="previous" stroke="var(--series-planned)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />}
            <Line dataKey="current" stroke="var(--series-actual)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {(m.key === "conversions" || m.key === "conversionRate" || m.key === "costPerConversion") && <p className="mt-2 text-xs text-text-3">Conversions are platform-reported; each platform defines and attributes them differently.</p>}
      <ChartTable
        caption={`${m.label} by day`}
        columns={comparison ? ["Date", m.label, "Comparison date", "Comparison"] : ["Date", m.label]}
        rows={data.map((d) => (comparison ? [formatDate(d.date), fmt(d.current), d.previousDate ? formatDate(d.previousDate) : "—", fmt(d.previous)] : [formatDate(d.date), fmt(d.current)]))}
      />
    </div>
  );
}
