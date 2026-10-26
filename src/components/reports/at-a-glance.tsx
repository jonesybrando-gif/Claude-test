import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Phone } from "lucide-react";
import { reportResults, type ClientReport } from "@/server/client-report";
import { contextInput } from "@/server/ai/context";
import { analyzePerformance } from "@/lib/insights";
import { attentionLines, budgetTile, headlineSentence, sentenceMoney } from "@/lib/at-a-glance";
import { changeVerdict, changeWords } from "@/lib/change";
import { pctChange } from "@/lib/metrics";
import { formatMoney, formatNumber } from "@/lib/money";
import { resultsDefinition } from "@/lib/results";
import { KPI_BY_KEY } from "@/lib/kpis";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { InfoTip } from "@/components/ui/info-tip";
import { ChangeLine } from "@/components/kpi/kpi-card";

type Change = { tone: "good" | "bad" | "neutral" | null; changePct: number | null; text: string; aria: string } | null;

function change(label: string, cur: number | null, prev: number | null | undefined, previousText: string, opts: { better: "up" | "down" | "neutral"; sample?: { current: number; previous: number } | null; stillCounting?: boolean }): Change {
  if (cur === null || prev === null || prev === undefined) return null;
  const changePct = pctChange(cur, prev);
  const { verdict, tone } = changeVerdict({ changePct, ...opts });
  if (!verdict) return null;
  return { tone, changePct, ...changeWords(verdict, changePct, previousText, label) };
}

function Tile({ label, info, value, chip, change: ch, note, extra }: { label: string; info: string; value: string; chip?: string; change?: Change; note?: string | null; extra?: ReactNode }) {
  return (
    <MetricCard
      label={label}
      info={info}
      value={value}
      chip={chip}
      change={ch ? <ChangeLine tone={ch.tone} changePct={ch.changePct} text={ch.text} aria={ch.aria} /> : note ? <span className="text-text-3">{note}</span> : null}
      extra={extra}
    />
  );
}

/** "This month" for a calendar-month budget period, else "this period". */
function budgetPeriodName(rep: ClientReport): { title: string; name: string } {
  const { start, end } = rep.pacing.period;
  const month = start.endsWith("-01") && start.slice(0, 7) === end.slice(0, 7);
  return month ? { title: "Budget this month", name: formatDate(start, { month: "long" }) } : { title: "Budget this period", name: "this budget period" };
}

/**
 * The first section of every client report: one headline sentence, four
 * tiles (Spent, Results, Cost per result, Budget) with their change in words,
 * and up to three things that need attention. Same on the staff Overview,
 * client logins and shared links (the PDF draws the same content).
 */
export function AtAGlance({ rep, marker }: { rep: ClientReport; marker?: ReactNode }) {
  const c = rep.client.currency;
  const t = rep.perf.totals;
  const p = rep.cmpPerf?.totals ?? null;
  const { current: r, previous: pr, stillCounting } = reportResults(rep);
  const ctx = contextInput(rep);
  const insights = analyzePerformance(ctx, { skipBudget: true });
  const total = rep.pacing.total;
  const period = budgetPeriodName(rep);
  const headline = headlineSentence({ range: rep.range, comparison: rep.cmpRange, today: rep.today, currency: c, results: r, previous: pr, stillCounting, driver: insights.driver });
  const attention = attentionLines(total, insights.notWorking, c, period.name);

  const awareness = r.goal === "AWARENESS";
  const resultsLabel = awareness ? "Clicks" : r.label;
  const unit = awareness ? "click" : r.singular;
  const counting = stillCounting && !awareness;
  const sample = pr ? { current: r.value, previous: pr.value } : null;
  const budget = budgetTile(total, c);
  const calls = rep.callsFromAds;
  const callsChange = calls && calls.previous !== null ? change("Calls from ads", calls.current, calls.previous, formatNumber(calls.previous), { better: "up", sample: { current: calls.current, previous: calls.previous } }) : null;

  return (
    <Card role="region" aria-labelledby="at-a-glance-title">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id="at-a-glance-title">At a glance</CardTitle>
          {marker}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="max-w-[75ch] text-base leading-relaxed text-text md:text-lg">{headline}</p>
          {stillCounting && <p className="text-xs text-text-3">The last few days may still rise as ad platforms finish counting results.</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Spent"
            info={`${KPI_BY_KEY.spend.plain}${t.hasEstimatedCost ? " Includes an estimate for Google Local Services ads, which don't report exact daily spend." : ""}`}
            value={formatMoney(t.costMinor, c, { whole: true })}
            chip={t.hasEstimatedCost ? "Estimated" : undefined}
            change={p ? change("Spent", t.costMinor, p.costMinor, formatMoney(p.costMinor, c, { whole: true }), { better: "neutral" }) : null}
            note={p ? null : "No comparison"}
          />
          <Tile
            label={resultsLabel}
            info={resultsDefinition(r)}
            value={formatNumber(Math.round(r.value))}
            change={pr ? change(resultsLabel, r.value, pr.value, formatNumber(Math.round(pr.value)), { better: "up", sample, stillCounting: counting }) : null}
            note={pr ? null : "No comparison"}
            extra={
              <>
                {r.valueMinor ? <p className="text-xs text-text-2">Worth {formatMoney(r.valueMinor, c, { whole: true })} by the ad platforms&apos; count</p> : null}
                {calls && (
                  <div className="mt-1 border-t border-border pt-2 text-xs text-text-2">
                    <p className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-text-3" aria-hidden />
                      Calls from ads (CallRail): <span className="font-medium text-text tabular">{formatNumber(calls.current)}</span>
                      <InfoTip label="Calls from ads" text="Phone calls CallRail traced to your ads (Google, Facebook/Instagram, Microsoft or Local Services ads). Shown alongside, not added to the total above, because the ad platforms often count the same calls." align="end" />
                    </p>
                    {callsChange && <ChangeLine tone={callsChange.tone} changePct={callsChange.changePct} text={callsChange.text} aria={callsChange.aria} className="mt-0.5" />}
                  </div>
                )}
              </>
            }
          />
          <Tile
            label={`Cost per ${unit}`}
            info={`Ad spend divided by ${awareness ? "clicks" : resultsLabel.toLowerCase()}: what one ${unit} cost on average.`}
            value={r.costPerMinor === null ? "—" : sentenceMoney(r.costPerMinor, c)}
            change={pr && r.costPerMinor !== null && pr.costPerMinor !== null ? change(`Cost per ${unit}`, r.costPerMinor, pr.costPerMinor, sentenceMoney(pr.costPerMinor, c), { better: "down", sample, stillCounting: counting }) : null}
            note={r.costPerMinor === null ? `No ${awareness ? "clicks" : resultsLabel.toLowerCase()} yet` : pr ? null : "No comparison"}
          />
          <Tile
            label={period.title}
            info="Spend so far compared with the budget. The month-end figure is an estimate at the current rate of spend."
            value={budget.short}
            note={budget.detail}
          />
        </div>
        <p className="text-xs text-text-3">Results are counted by each ad platform and may not match your own records.</p>

        <section aria-labelledby="attention-title" className="flex flex-col gap-2">
          <h3 id="attention-title" className="text-sm font-semibold">Needs your attention</h3>
          {attention.length ? (
            <ul className="flex flex-col gap-1.5">
              {attention.map((x) => (
                <li key={x} className="flex items-start gap-2 text-sm text-text">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden />
                  <span className="max-w-[80ch]">{x}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-text-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-good-ink" aria-hidden /> Nothing needs attention right now.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
