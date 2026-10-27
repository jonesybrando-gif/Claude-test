import type { ReactNode } from "react";
import { prisma } from "@/server/db";
import { metricTotals } from "@/server/metrics/query";
import { reportResults, type ClientReport } from "@/server/client-report";
import { clientNextStepLines } from "@/server/next-steps";
import { addDays, dateToIso, diffDays, minDate, type IsoDate } from "@/lib/pacing/dates";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/time";

// The client-facing report opens with four plain questions a business owner
// asks: how much did we spend, what did we get, is it getting better, what
// happens next. Every sentence is built from the report's figures; next steps
// are only the ones the agency approved. Technical detail sits below, folded.

type Move = { label: string; now: number; before: number | null; counting?: boolean; noun: string };

const short = (d: IsoDate) => formatDate(d, { month: "short", day: "numeric" });

/** "up 12%", "down 8%", "about the same", or null when there's nothing fair to compare. */
function moveWords(m: Move): { words: string; dir: -1 | 0 | 1 } | null {
  if (m.before === null || m.before <= 0) return null;
  const pct = ((m.now - m.before) / m.before) * 100;
  if (Math.abs(pct) < 5) return { words: "about the same", dir: 0 };
  return { words: `${pct > 0 ? "up" : "down"} ${Math.round(Math.abs(pct))}%`, dir: pct > 0 ? 1 : -1 };
}

async function channelFigures(rep: ClientReport) {
  const assets = await prisma.dataAsset.findMany({
    where: { clientId: rep.client.id, kind: { in: ["GSC_SITE", "GA4_PROPERTY"] }, status: "ACTIVE" },
    select: { kind: true, dataCompleteThrough: true },
  });
  const read = async (kind: "GSC_SITE" | "GA4_PROPERTY", key: string) => {
    const a = assets.find((x) => x.kind === kind);
    if (!a?.dataCompleteThrough) return null;
    // Same trimming as the agency tabs: end at the last complete day, compare the same number of days.
    const to = minDate(rep.range.to, dateToIso(a.dataCompleteThrough));
    const days = diffDays(rep.range.from, to) + 1;
    if (days < 1) return null;
    const now = (await metricTotals(rep.client.id, [key], rep.range.from, to))[key];
    const before = rep.cmpRange ? (await metricTotals(rep.client.id, [key], rep.cmpRange.from, minDate(addDays(rep.cmpRange.from, days - 1), rep.cmpRange.to)))[key] : null;
    return now === null ? null : { now, before };
  };
  const [search, goals, visits] = await Promise.all([read("GSC_SITE", "gsc.clicks"), read("GA4_PROPERTY", "ga4.keyEvents"), read("GA4_PROPERTY", "ga4.sessions")]);
  return { search, goals, visits };
}

export async function ClientStory({ rep, showSearch = true, showWebsite = true }: { rep: ClientReport; showSearch?: boolean; showWebsite?: boolean }) {
  const c = rep.client.currency;
  const money = (m: number) => formatMoney(m, c, { whole: true });
  const spend = rep.perf.totals.costMinor;
  const { current: r, previous: pr, stillCounting } = reportResults(rep);
  const awareness = r.goal === "AWARENESS";
  const resultWord = awareness ? "clicks on your ads" : r.label === "Results" ? "results from your ads" : `${r.label.toLowerCase()} from your ads`;
  const [ch, steps] = await Promise.all([channelFigures(rep), clientNextStepLines(rep.client.id, rep.client.timezone)]);
  const search = showSearch ? ch.search : null;
  const goals = showWebsite ? ch.goals : null;

  // 1. Spend, and the budget when the report covers the current budget period.
  const total = rep.pacing.total;
  const budgetLine =
    total && total.budgetMinor > 0 && rep.range.to >= total.periodStart && rep.range.from <= total.periodEnd
      ? total.phase === "ENDED"
        ? `${money(total.actualToDateMinor)} of the ${money(total.budgetMinor)} budget was spent.`
        : `On track to spend about ${money(total.projectedMinor)} of your ${money(total.budgetMinor)} budget for ${formatDate(total.periodStart, { month: "long" })}.`
      : null;

  // 2–3. What came in, and whether it's improving.
  const moves: Move[] = [
    { label: "From your ads", now: r.value, before: pr?.value ?? null, counting: stillCounting && !awareness, noun: awareness ? "clicks" : r.label.toLowerCase() },
    ...(search ? [{ label: "From regular Google search", now: search.now, before: search.before, noun: "clicks to your website" }] : []),
    ...(goals ? [{ label: "On your website", now: goals.now, before: goals.before, noun: "goals reached (form fills, calls, bookings…)" }] : []),
  ];
  const judged = moves.map((m) => ({ m, w: moveWords(m) })).filter((x) => x.w);
  const firm = judged.filter((x) => !x.m.counting);
  const ups = firm.filter((x) => x.w!.dir > 0).length;
  const downs = firm.filter((x) => x.w!.dir < 0).length;
  const verdict = !rep.cmpRange || !judged.length
    ? null
    : ups && !downs
      ? "Yes, things are improving"
      : downs && !ups
        ? "Down compared with the period before"
        : ups && downs
          ? "Mixed: some up, some down"
          : firm.length
            ? "About the same as the period before"
            : "Too early to say: recent results are still being counted";
  const cmpLabel = rep.cmpRange ? `${short(rep.cmpRange.from)}–${short(rep.cmpRange.to)}` : null;

  return (
    <section aria-label="Your results in brief" className="flex flex-col gap-0 rounded-xl border border-border bg-surface">
      <Question q="How much did we spend?" answer={`${money(spend)} on ads`}>
        {budgetLine && <p className="text-[15px] leading-relaxed text-text-2">{budgetLine}</p>}
      </Question>

      <Question q="What did we get?" answer={`${formatNumber(r.value, 0)} ${resultWord}`}>
        {(search || goals) && (
          <ul className="flex flex-col gap-1 text-[15px] leading-relaxed text-text-2">
            {search && <li><b className="font-semibold text-text tabular">{formatNumber(search.now, 0)}</b> people clicked through to your website from regular Google search (not ads).</li>}
            {goals && <li><b className="font-semibold text-text tabular">{formatNumber(goals.now, 0)}</b> times a visitor reached a goal on your website, such as a form or a call{ch.visits ? `, from ${formatNumber(ch.visits.now, 0)} visits` : ""}.</li>}
          </ul>
        )}
        {!awareness && <p className="text-[13px] text-text-3">Counted by the ad platforms{goals ? " and Google Analytics, which count in different ways, so the numbers don't add up to one total" : ""}.</p>}
      </Question>

      {verdict && (
        <Question q="Is it getting better?" answer={verdict}>
          <ul className="flex flex-col gap-1.5 text-[15px] leading-relaxed">
            {judged.map(({ m, w }) => (
              <li key={m.label} className="flex flex-wrap gap-x-2">
                <span className="text-text-2">{m.label}:</span>
                <span className={w!.dir > 0 && !m.counting ? "font-medium text-good-ink" : w!.dir < 0 && !m.counting ? "font-medium text-critical-ink" : "font-medium text-text"}>{w!.words}</span>
                <span className="text-text-3">({formatNumber(m.now, 0)} {m.noun}, was {formatNumber(m.before!, 0)}){m.counting ? " · still being counted" : ""}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-text-3">Compared with {cmpLabel}.</p>
        </Question>
      )}

      {steps.length > 0 && (
        <Question q="What happens next?" answer={null}>
          <ul className="flex flex-col gap-2 text-[15px] leading-relaxed">
            {steps.map((s) => <li key={s} className="flex gap-2"><span aria-hidden className="text-text-3">•</span><span>{s}</span></li>)}
          </ul>
        </Question>
      )}
    </section>
  );
}

function Question({ q, answer, children }: { q: string; answer: string | null; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border px-6 py-5 last:border-b-0">
      <h2 className="text-sm font-semibold text-brand-text">{q}</h2>
      {answer && <p className="text-2xl leading-snug font-semibold tracking-tight">{answer}</p>}
      {children}
    </div>
  );
}
