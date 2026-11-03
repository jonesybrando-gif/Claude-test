"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatMoney, formatMoneyCompact, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { ChartSummary, ChartTable } from "@/components/charts/chart-table";

type Day = { date: string; spendMinor: number; results: number };

/**
 * Daily spend as bars with the day's results as a line on its own scale,
 * plus the agency's client-visible notes as markers. A sentence above and a
 * table below carry the same numbers for people who don't read the chart.
 */
export function DailyResultsChart({ days, resultLabel, currency, notes }: { days: Day[]; resultLabel: string; currency: string; notes: { date: string; text: string }[] }) {
  const spend = days.reduce((n, d) => n + d.spendMinor, 0);
  const results = days.reduce((n, d) => n + d.results, 0);
  const peak = days.reduce((best, d) => (d.spendMinor > best.spendMinor ? d : best), days[0]);
  const bestDay = days.reduce((best, d) => (d.results > best.results ? d : best), days[0]);
  const summary =
    `${formatMoney(spend, currency, { whole: true })} over ${days.length} days, ${formatNumber(Math.round(results))} ${resultLabel.toLowerCase()}. ` +
    `Highest spend ${formatDate(peak.date)} (${formatMoney(peak.spendMinor, currency, { whole: true })})` +
    (bestDay.results > 0 ? `; most ${resultLabel.toLowerCase()} ${formatDate(bestDay.date)} (${formatNumber(Math.round(bestDay.results))}).` : ".");

  function Tip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as Day;
    const note = notes.find((n) => n.date === d.date);
    return (
      <div className="max-w-64 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
        <p className="mb-1 font-medium">{formatDate(d.date, { weekday: "short", month: "short", day: "numeric" })}</p>
        <div className="flex justify-between gap-4"><span className="text-text-2">Spend</span><span className="font-medium tabular">{formatMoney(d.spendMinor, currency)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-text-2">{resultLabel}</span><span className="font-medium tabular">{formatNumber(d.results, d.results % 1 ? 1 : 0)}</span></div>
        {note && <p className="mt-1.5 border-t border-border pt-1.5 text-text-2">◆ {note.text}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChartSummary text={summary} className="mb-0" />
        <div className="flex gap-4 text-xs text-text-3" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--series-actual)]" /> Spend</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-[var(--series-projected)]" /> {resultLabel}</span>
        </div>
      </div>
      <div className="mt-3 h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, { month: "short", day: "numeric" })} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} minTickGap={28} />
            <YAxis yAxisId="spend" tickFormatter={(v) => formatMoneyCompact(v, currency)} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <YAxis yAxisId="results" orientation="right" allowDecimals={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--surface-2)" }} />
            {notes.map((n) => (
              <ReferenceLine key={`${n.date}-${n.text}`} yAxisId="spend" x={n.date} stroke="var(--text-3)" strokeDasharray="3 3" label={{ value: "◆", position: "top", fill: "var(--text-2)", fontSize: 11 }} />
            ))}
            <Bar yAxisId="spend" dataKey="spendMinor" fill="var(--series-actual)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="results" dataKey="results" type="monotone" stroke="var(--series-projected)" strokeWidth={2.25} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        caption={`Spend and ${resultLabel.toLowerCase()} by day`}
        columns={["Date", "Spend", resultLabel]}
        rows={days.map((d) => [formatDate(d.date), formatMoney(d.spendMinor, currency), formatNumber(d.results, d.results % 1 ? 1 : 0)])}
      />
    </div>
  );
}
