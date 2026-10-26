"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatMetric, type MetricInfo } from "@/lib/dashboards/metrics";
import { formatPct } from "@/lib/money";
import { summarizeBreakdown } from "@/lib/chart-summary";
import { ChartSummary, ChartTable } from "./chart-table";

// Breakdown charts (share by a dimension) in the same visual language as the
// trend and pacing charts. Both fill their parent's height.

/** Categorical colours from the app's tokens; the last slice ("Other") is grey. */
export const CATEGORY_COLORS = ["var(--series-actual)", "var(--series-projected)", "var(--good)", "var(--warning)", "var(--brand)", "var(--critical)", "var(--serious)"];
const OTHER_COLOR = "var(--series-planned)";

export interface BreakdownRow {
  label: string;
  values: Record<string, number | null>;
}

/** Top slices plus "Other", positive values only. */
export function pieSlices(rows: BreakdownRow[], key: string, max = 6): { label: string; value: number; color: string }[] {
  const pos = rows.map((r) => ({ label: r.label, value: r.values[key] ?? 0 })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const top = pos.slice(0, pos.length > max ? max - 1 : max).map((r, i) => ({ ...r, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  const rest = pos.slice(top.length).reduce((a, r) => a + r.value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest, color: OTHER_COLOR }] : top;
}

export function MetricPieChart({ rows, metric, currency = "USD" }: { rows: BreakdownRow[]; metric: MetricInfo; currency?: string }) {
  const slices = pieSlices(rows, metric.key);
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return <p className="py-6 text-center text-sm text-text-3">Nothing to show for this period.</p>;

  function Tip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const s = payload[0].payload as (typeof slices)[number];
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
        <p className="text-text-2">{s.label}</p>
        <p className="font-medium tabular">{formatMetric(metric, s.value, currency)} · {formatPct((s.value / total) * 100, 1)}</p>
      </div>
    );
  }

  const fmt = (v: number | null) => formatMetric(metric, v, currency);
  return (
    <div className="relative flex h-full min-h-0 flex-col">
    <ChartSummary text={summarizeBreakdown(metric.label, slices, (v) => fmt(v), { share: true })} className="mb-1 line-clamp-2" />
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
      <div className="h-40 min-h-0 sm:h-full sm:min-w-0 sm:flex-1" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<Tip />} />
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="90%" paddingAngle={1} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.label} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex min-w-0 flex-col gap-1 text-xs sm:max-w-[55%]">
        {slices.map((s) => (
          <li key={s.label} className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-text-2" title={s.label}>{s.label}</span>
            <span className="shrink-0 font-medium tabular">{formatPct((s.value / total) * 100, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
    <ChartTable
      overlay
      className="mt-1 shrink-0"
      caption={`Share of ${metric.label.toLowerCase()}`}
      columns={["Name", metric.label, "Share"]}
      rows={slices.map((s) => [s.label, fmt(s.value), formatPct((s.value / total) * 100, 1)])}
    />
    </div>
  );
}

/** Horizontal bars, one per dimension value (top 10), for the first metric. */
export function BreakdownBarChart({ rows, metric, currency = "USD" }: { rows: BreakdownRow[]; metric: MetricInfo; currency?: string }) {
  const data = rows.slice(0, 10).map((r) => ({ label: r.label, value: r.values[metric.key] ?? null }));

  function Tip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
        <p className="text-text-2">{p.label}</p>
        <p className="font-medium tabular">{formatMetric(metric, p.value, currency)}</p>
      </div>
    );
  }

  const fmt = (v: number | null) => formatMetric(metric, v, currency);
  return (
    <div className="relative flex h-full min-h-0 flex-col">
    <ChartSummary text={summarizeBreakdown(metric.label, metric.format === "position" ? data.map((d) => ({ ...d, value: d.value === null ? null : -d.value })) : data, (v) => fmt(Math.abs(v)))} className="mb-1 line-clamp-2" />
    <div className="min-h-0 flex-1" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="25%">
          <XAxis type="number" hide reversed={metric.format === "position"} />
          <YAxis type="category" dataKey="label" width={120} tick={{ fill: "var(--text-2)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
          <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="value" fill="var(--series-actual)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <ChartTable overlay className="mt-1 shrink-0" caption={metric.label} columns={["Name", metric.label]} rows={rows.map((r) => [r.label, fmt(r.values[metric.key] ?? null)])} />
    </div>
  );
}
