"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { DailyMetrics } from "@/server/reporting";
import { derive } from "@/lib/metrics";
import { formatMoney, formatMoneyCompact, formatNumber, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { cn } from "../ui/cn";

type MetricKey = "spend" | "conversions" | "leads" | "cpl" | "clicks" | "impressions" | "cvr";

const METRICS: { key: MetricKey; label: string; kind: "money" | "number" | "pct" }[] = [
  { key: "spend", label: "Spend", kind: "money" },
  { key: "conversions", label: "Conversions", kind: "number" },
  { key: "leads", label: "Leads", kind: "number" },
  { key: "cpl", label: "Cost per lead", kind: "money" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "cvr", label: "Conversion rate", kind: "pct" },
];

function value(d: DailyMetrics, key: MetricKey): number | null {
  const x = derive(d);
  switch (key) {
    case "spend": return d.costMinor;
    case "conversions": return d.conversions;
    case "leads": return d.leads;
    case "cpl": return x.costPerLeadMinor;
    case "clicks": return d.clicks;
    case "impressions": return d.impressions;
    case "cvr": return x.conversionRate;
  }
}

export function TrendChart({ current, comparison, currency = "USD" }: { current: DailyMetrics[]; comparison: DailyMetrics[] | null; currency?: string }) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const m = METRICS.find((x) => x.key === metric)!;
  const fmt = (v: number | null, axis = false) =>
    v === null ? "—" : m.kind === "money" ? (axis ? formatMoneyCompact(v, currency) : formatMoney(v, currency, { whole: v >= 10000 })) : m.kind === "pct" ? formatPct(v) : formatNumber(v, v < 10 ? 1 : 0);
  // Comparison is aligned by day offset (day 1 vs day 1).
  const data = current.map((d, i) => ({
    date: d.date,
    current: value(d, metric),
    previous: comparison?.[i] ? value(comparison[i], metric) : null,
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
        {METRICS.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={metric === x.key}
            onClick={() => setMetric(x.key)}
            className={cn("rounded-md px-2.5 py-1 text-xs cursor-pointer", metric === x.key ? "bg-surface-2 font-medium text-text ring-1 ring-border" : "text-text-2 hover:text-text")}
          >
            {x.label}
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
      {(metric === "conversions" || metric === "cvr") && <p className="mt-2 text-xs text-text-3">Conversions are platform-reported; each platform defines and attributes them differently.</p>}
    </div>
  );
}
