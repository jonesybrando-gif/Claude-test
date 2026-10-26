// "At a glance": the first thing a client report shows. Plain sentences built
// from the figures, for readers with no advertising knowledge. Pure, so the
// client page, shared links, the PDF and the automatic summary say the same.

import type { DateRange } from "./date-ranges";
import type { PacingResult } from "./pacing/engine";
import { displayPacingStatus } from "./pacing/display-status";
import { monthBounds, type IsoDate } from "./pacing/dates";
import { formatMoney, formatNumber } from "./money";
import { formatDate } from "./time";
import { pctChange } from "./metrics";
import { MIN_CHANGE_PCT, MIN_SAMPLE } from "./change";
import type { Results } from "./results";
import type { Driver } from "./insights";

const isWholeMonth = (r: DateRange) => r.from === monthBounds(r.from).start && r.to === monthBounds(r.from).end;
const monthName = (d: IsoDate, today: IsoDate) => formatDate(d, d.slice(0, 4) === today.slice(0, 4) ? { month: "long" } : { month: "long", year: "numeric" });

/** "In September", "So far in October", or "From Sep 17 to Oct 16". */
export function periodPhrase(range: DateRange, today: IsoDate): string {
  if (isWholeMonth(range)) return `In ${monthName(range.from, today)}`;
  const m = monthBounds(range.from);
  if (range.from === m.start && range.to < m.end && today > range.to && today <= m.end) return `So far in ${monthName(range.from, today)}`;
  return `From ${formatDate(range.from)} to ${formatDate(range.to)}`;
}

/** "August" for a whole-month comparison, else "the previous period". */
export function comparisonName(cmp: DateRange | null, today: IsoDate): string {
  return cmp && isWholeMonth(cmp) ? monthName(cmp.from, today) : "the previous period";
}

/** Money for sentences: whole units from $100 up, cents below. */
export const sentenceMoney = (minor: number, currency: string) => formatMoney(minor, currency, { whole: Math.abs(minor) >= 10000 });

const count = (n: number) => formatNumber(Math.round(n));
const plural = (n: number, one: string) => `${one}${Math.round(n) === 1 ? "" : "s"}`;

export interface HeadlineInput {
  range: DateRange;
  comparison: DateRange | null;
  today: IsoDate;
  currency: string;
  results: Results;
  previous: Results | null;
  /** Recent results are still being counted: no cost comparison yet. */
  stillCounting?: boolean;
  /** The campaign behind the results (from insights), only when one stands out with enough volume. */
  driver?: Driver | null;
}

/**
 * One sentence, results first, e.g. "In September you spent $5,961 and got 21
 * leads at about $278 each — 34% more per lead than August."
 */
export function headlineSentence(i: HeadlineInput): string {
  const c = i.currency;
  const r = i.results;
  const when = periodPhrase(i.range, i.today);
  const spent = sentenceMoney(r.costMinor, c);
  if (r.costMinor === 0 && r.value === 0) return `${when} no advertising spend or results were recorded.`;
  let s: string;
  if (r.goal === "AWARENESS") {
    s = r.value > 0 ? `${when} you spent ${spent} and people clicked your ads ${count(r.value)} ${plural(r.value, "time")}, at about ${sentenceMoney(r.costPerMinor!, c)} per click` : `${when} you spent ${spent}; nobody clicked your ads`;
  } else if (r.value > 0) {
    s = `${when} you spent ${spent} and got ${count(r.value)} ${plural(r.value, r.singular)} at about ${sentenceMoney(r.costPerMinor!, c)} each`;
    if (r.valueMinor) s += `, worth ${sentenceMoney(r.valueMinor, c)} by the ad platforms' count`;
  } else {
    s = `${when} you spent ${spent}; the ad platforms reported no ${r.label === "Results" ? "results" : r.label.toLowerCase()}`;
  }
  const p = i.previous;
  const comparable = p && p.costPerMinor !== null && r.costPerMinor !== null && r.value >= MIN_SAMPLE && p.value >= MIN_SAMPLE && !(i.stillCounting && r.goal !== "AWARENESS");
  if (comparable) {
    const ch = pctChange(r.costPerMinor!, p.costPerMinor!)!;
    const unit = r.goal === "AWARENESS" ? "click" : r.singular;
    const vs = comparisonName(i.comparison, i.today);
    s += Math.abs(ch) < MIN_CHANGE_PCT ? ` — about the same per ${unit} as ${vs}` : ` — ${Math.round(Math.abs(ch))}% ${ch > 0 ? "more" : "less"} per ${unit} than ${vs}`;
  }
  s += ".";
  if (i.driver && r.goal !== "AWARENESS") s += ` ${i.driver.name} (${i.driver.platform}) did best, at ${sentenceMoney(i.driver.costPerMinor, c)} per ${r.singular}.`;
  return s;
}

type Pacing = Pick<PacingResult, "status" | "forecastStatus" | "phase" | "budgetMinor" | "actualToDateMinor" | "projectedMinor" | "remainingBudgetMinor">;

/** The "Budget this month" tile: "On track", "About $375 over (estimate)", "No budget set". */
export function budgetTile(p: Pacing | null, currency: string): { value: string; short: string; detail: string | null; tone: "good" | "bad" | "neutral" } {
  if (!p) return { value: "No budget set", short: "No budget set", detail: null, tone: "neutral" };
  const spent = `${formatMoney(p.actualToDateMinor, currency, { whole: true })} of ${formatMoney(p.budgetMinor, currency, { whole: true })} spent`;
  if (p.phase === "NOT_STARTED") return { value: "Not started", short: "Not started", detail: `Budget ${formatMoney(p.budgetMinor, currency, { whole: true })}`, tone: "neutral" };
  const shown = displayPacingStatus(p).status;
  const diff = p.projectedMinor - p.budgetMinor;
  if (shown === "ON_TARGET") return { value: "On track", short: "On track", detail: spent, tone: "good" };
  const over = shown === "OVERSPENDING" || shown === "SLIGHTLY_OVER";
  const ended = p.phase === "ENDED";
  const amount = formatMoney(Math.abs(diff), currency, { whole: true });
  const base = `${ended ? "" : "About "}${amount} ${over ? "over" : "under"}`;
  // `short` (for narrow tiles) moves "(estimate)" into the detail line.
  return { value: ended ? base : `${base} (estimate)`, short: base, detail: ended ? spent : `${spent} · estimate`, tone: shown === "OVERSPENDING" || shown === "UNDERSPENDING" ? "bad" : "neutral" };
}

/**
 * "You've spent $5,141 of $6,000 so far. At this rate October ends around
 * $6,375, about $375 over budget (estimate)."
 */
export function pacingHeadline(p: Pacing, currency: string, periodName: string): string {
  const m = (v: number) => formatMoney(v, currency, { whole: true });
  if (p.phase === "NOT_STARTED") return `The ${m(p.budgetMinor)} budget for ${periodName} hasn't started yet.`;
  if (p.phase === "ENDED") {
    const diff = p.actualToDateMinor - p.budgetMinor;
    const tail = Math.abs(diff) < p.budgetMinor * 0.02 ? "right on budget" : `${m(Math.abs(diff))} ${diff > 0 ? "over" : "under"} budget`;
    return `You spent ${m(p.actualToDateMinor)} of the ${m(p.budgetMinor)} budget for ${periodName}, ${tail}.`;
  }
  const diff = p.projectedMinor - p.budgetMinor;
  const where =
    displayPacingStatus(p).status === "ON_TARGET" || Math.abs(diff) < p.budgetMinor * 0.02
      ? "close to budget"
      : `about ${m(Math.abs(diff))} ${diff > 0 ? "over" : "under"} budget`;
  return `You've spent ${m(p.actualToDateMinor)} of ${m(p.budgetMinor)} so far. At this rate ${periodName} ends around ${m(p.projectedMinor)}, ${where} (estimate).`;
}

/** Up to three "Needs your attention" lines: the budget forecast first, then what isn't working. */
export function attentionLines(p: Pacing | null, notWorking: string[], currency: string, periodName: string, max = 3): string[] {
  const out: string[] = [];
  if (p && p.phase === "ACTIVE") {
    const shown = displayPacingStatus(p).status;
    if (shown === "OVERSPENDING" || shown === "UNDERSPENDING") {
      const diff = p.projectedMinor - p.budgetMinor;
      out.push(`Budget: at this rate ${periodName} ends about ${formatMoney(Math.abs(diff), currency, { whole: true })} ${diff > 0 ? "over" : "under"} budget (estimate).`);
    }
  }
  for (const x of notWorking) if (out.length < max) out.push(x);
  return out.slice(0, max);
}
