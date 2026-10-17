"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { DailyMetrics } from "@/server/reporting";
import { dailyKpiValue, formatKpi, KPI_BY_KEY, type KpiKey } from "@/lib/kpis";
import { formatMoneyCompact, formatNumber, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { cn } from "../ui/cn";

const DEFAULT_METRICS: KpiKey[] = ["spend", "conversions", "leads", "costPerLead", "clicks", "impressions", "conversionRate"];

export function TrendChart({ current, comparison, currency = "USD", metrics = DEFAULT_METRICS }: { current: DailyMetrics[]; comparison: DailyMetrics[] | null; currency?: string; metrics?: KpiKey[] }) {
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

  function Tip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
        <div className="flex justify-between gap-4"><span className="text-text-2">{formatDate(p.date)}</span><span className="font-medium tabular">{fmt(p.current)}</span></div>
        {p.previousDate && <div className="flex justify-between gap-4"><span className="text-text-3">{formatDate(p.previousDate)}</span><span className="tabular text-text-2">{fmt(p.previous)}</span></div>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Metric">
        {metrics.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={m.key === k}
            onClick={() => setMetric(k)}
            className={cn("rounded-md px-2.5 py-1 text-xs cursor-pointer", m.key === k ? "bg-surface-2 font-medium text-text ring-1 ring-border" : "text-text-2 hover:text-text")}
          >
            {KPI_BY_KEY[k].label}
          </button>
        ))}
      </div>
      {comparison && (
        <div className="mb-2 flex gap-4 text-xs text-text-2">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[var(--series-actual)]" /> Selected period</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-[var(--series-planned)]" /> Comparison period</span>
        </div>
      )}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v) => fmt(v, true)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={<Tip />} cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }} />
            {comparison && <Line dataKey="previous" stroke="var(--series-planned)" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />}
            <Line dataKey="current" stroke="var(--series-actual)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {(m.key === "conversions" || m.key === "conversionRate" || m.key === "costPerConversion") && <p className="mt-2 text-xs text-text-3">Conversions are platform-reported; each platform defines and attributes them differently.</p>}
    </div>
  );
}
