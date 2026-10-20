// What's working, what isn't, and what to do about it, worked out directly
// from a report's figures. Used by the automatic executive summary; every
// statement quotes numbers from the report and nothing is guessed.

import type { AiContextInput } from "./ai-context";
import { derive, pctChange, type MetricTotals } from "./metrics";
import { formatMoney, formatNumber, formatPct } from "./money";
import { diffDays } from "./pacing/dates";

export interface Insights {
  working: string[];
  notWorking: string[];
  recommendations: string[];
}

/** A campaign or platform worth calling out needs at least this share of spend. */
const MIN_SHARE = 0.05;
const MAX_ITEMS = 5;
const MAX_RECS = 6;

type Unit = "conversion" | "lead";

/** The result a report is judged on: conversions when any were reported, else leads. */
function resultUnit(t: MetricTotals): Unit | null {
  if (t.conversions > 0) return "conversion";
  if (t.leads > 0) return "lead";
  return null;
}

/** Results for one line: its conversions, or its leads when it reported leads but no conversions (e.g. LSA). */
const resultsOf = (t: MetricTotals, unit: Unit) => (unit === "conversion" ? (t.conversions > 0 ? t.conversions : t.leads) : t.leads);
const plural = (n: number, unit: Unit) => `${formatNumber(n, n < 100 ? 1 : 0)} ${unit}${n === 1 ? "" : "s"}`;
const pctText = (p: number) => formatPct(Math.abs(p), 0);

/**
 * True when conversion value is exactly one currency unit per conversion: the
 * ad platform's default when no real values are set, so ROAS means nothing.
 */
export function hasPlaceholderValues(t: MetricTotals): boolean {
  return t.conversions >= 5 && t.conversionValueMinor > 0 && Math.abs(t.conversionValueMinor / t.conversions - 100) < 1;
}

export function analyzePerformance(i: AiContextInput): Insights {
  const c = i.currency;
  const money = (v: number) => formatMoney(v, c, { whole: v >= 10000 });
  const t = i.totals;
  const p = i.previous;
  const working: string[] = [];
  const notWorking: string[] = [];
  // Recommendations carry a priority (1 = most urgent) so the cap keeps the ones that matter most.
  const recs: { priority: number; text: string }[] = [];
  const rec = (priority: number, text: string) => recs.push({ priority, text });
  if (t.costMinor === 0 && t.clicks === 0 && t.impressions === 0) return { working, notWorking, recommendations: [] };

  const unit = resultUnit(t);
  const results = unit ? resultsOf(t, unit) : 0;
  const avgCpr = unit && results > 0 ? t.costMinor / results : null;
  const d = derive(t);
  const pd = p ? derive(p) : null;

  // --- Campaigns ------------------------------------------------------------
  const rated = i.campaigns
    .filter((cmp) => cmp.totals.costMinor > 0)
    .map((cmp) => {
      const r = unit ? resultsOf(cmp.totals, unit) : 0;
      const prevR = unit && cmp.previous ? resultsOf(cmp.previous, unit) : 0;
      return {
        ...cmp,
        label: `${cmp.name} (${cmp.platform})`,
        results: r,
        cpr: r > 0 ? cmp.totals.costMinor / r : null,
        prevCpr: cmp.previous && prevR > 0 ? cmp.previous.costMinor / prevR : null,
        share: t.costMinor > 0 ? cmp.totals.costMinor / t.costMinor : 0,
      };
    });
  const significant = rated.filter((x) => x.share >= MIN_SHARE);

  let best: (typeof rated)[number] | undefined;
  let worst: (typeof rated)[number] | undefined;
  if (unit && avgCpr !== null) {
    // Strong performers: a meaningful share of spend at a clearly lower cost per result.
    const strong = significant.filter((x) => x.cpr !== null && x.cpr <= avgCpr * 0.85).sort((a, b) => b.results - a.results);
    for (const x of strong.slice(0, 3)) {
      working.push(`${x.label} delivered ${plural(x.results, unit)} at ${money(x.cpr!)} each, ${pctText((1 - x.cpr! / avgCpr) * 100)} below the ${money(avgCpr)} average, on ${formatPct(x.share * 100, 0)} of spend.`);
    }
    // With no clear standout, still name the most efficient campaign when it is ahead of the average.
    const ranked = significant.filter((x) => x.cpr !== null).sort((a, b) => a.cpr! - b.cpr!);
    if (!strong.length && ranked.length >= 2 && ranked[0].cpr! <= avgCpr * 0.95) {
      const x = ranked[0];
      working.push(`${x.label} is the most efficient campaign: ${plural(x.results, unit)} at ${money(x.cpr!)} each, against the ${money(avgCpr)} average.`);
    }
    best = strong[0] ?? (ranked.length >= 2 && ranked[0].cpr! <= avgCpr * 0.95 ? ranked[0] : undefined);

    // Spend with nothing to show for it.
    const empty = significant.filter((x) => x.results === 0).sort((a, b) => b.totals.costMinor - a.totals.costMinor);
    for (const x of empty.slice(0, 3)) {
      notWorking.push(`${x.label} spent ${money(x.totals.costMinor)} (${formatPct(x.share * 100, 0)} of spend) without a single ${unit}.`);
    }
    // Results that cost far more than the rest.
    // Ranked by how much more they cost than the same results at the average rate.
    const excess = (x: (typeof rated)[number]) => x.totals.costMinor - x.results * avgCpr;
    const costly = significant.filter((x) => x.cpr !== null && x.cpr >= avgCpr * 1.3).sort((a, b) => excess(b) - excess(a));
    for (const x of costly.slice(0, 3)) {
      notWorking.push(`${x.label} paid ${money(x.cpr!)} per ${unit}, ${formatNumber(x.cpr! / avgCpr, 1)}× the ${money(avgCpr)} average, across ${formatPct(x.share * 100, 0)} of spend.`);
    }
    worst = empty[0] ?? costly[0];

    // Campaigns getting more or less efficient than last period.
    for (const x of significant) {
      if (x.cpr === null || x.prevCpr === null) continue;
      const ch = pctChange(x.cpr, x.prevCpr)!;
      if (ch <= -20 && !strong.includes(x) && x !== best) working.push(`${x.label} became more efficient: cost per ${unit} fell ${pctText(ch)} to ${money(x.cpr)}.`);
      if (ch >= 25 && !costly.includes(x) && x.cpr > avgCpr) notWorking.push(`${x.label} got more expensive: cost per ${unit} rose ${pctText(ch)} to ${money(x.cpr)}.`);
    }

    for (const x of empty.slice(0, 2)) {
      rec(2, 
        `Review ${x.label}: check its targeting${x.platform === "Google Ads" ? ", search terms" : ""} and landing page, and confirm its conversion tracking is firing. If it still produces nothing, pause it or move its ${money(x.totals.costMinor)} to ${best && best !== x ? best.label : "the campaigns that are producing results"}.`,
      );
    }
    for (const x of costly.slice(0, 2)) {
      if (x.budget && x.budget.status.includes("UNDER") && x.budget.requiredDailyMinor !== null) {
        // Pacing alone would say "spend more"; at this cost per result, fix efficiency first.
        rec(3, `Tighten ${x.label} before letting it spend more: its own budget is pacing under (about ${money(x.budget.currentDailyRateMinor)} a day against ${money(x.budget.requiredDailyMinor)} needed), but at ${money(x.cpr!)} per ${unit} extra spend would buy few results. Cut its weakest ${x.platform === "Meta Ads" ? "audiences and ads" : "keywords, placements and audiences"} first, or lower its budget${best && best !== x ? ` and move the difference to ${best.label}` : ""}.`);
        continue;
      }
      rec(3, `Tighten ${x.label}: cut the ${x.platform === "Meta Ads" ? "audiences and ads" : "keywords, placements and audiences"} with the highest cost per ${unit}, and lower bids or its budget until it comes closer to the ${money(avgCpr)} average.`);
    }
    if (best && worst && best !== worst) {
      rec(3, `Shift budget toward ${best.label}, which costs ${money(best.cpr!)} per ${unit}, away from ${worst.label}${worst.cpr ? ` at ${money(worst.cpr)}` : ", which produced none"}. Increase in steps of 15–20% and watch whether its cost per ${unit} holds.`);
    } else if (best) {
      rec(4, `Give ${best.label} more room: it is the most efficient campaign at ${money(best.cpr!)} per ${unit}. If it is limited by budget, raise its budget in steps of 15–20% and watch whether its cost per ${unit} holds.`);
    }
  }

  // --- Platforms --------------------------------------------------------------
  const platforms = i.accounts.filter((a) => a.totals && a.totals.costMinor > 0 && t.costMinor > 0 && a.totals.costMinor / t.costMinor >= MIN_SHARE);
  if (unit && platforms.length >= 2) {
    const withCpr = platforms
      .map((a) => ({ a, r: resultsOf(a.totals!, unit) }))
      .filter((x) => x.r > 0)
      .map((x) => ({ ...x, cpr: x.a.totals!.costMinor / x.r }))
      .sort((x, y) => x.cpr - y.cpr);
    if (withCpr.length >= 2 && withCpr[withCpr.length - 1].cpr >= withCpr[0].cpr * 1.3) {
      const lo = withCpr[0];
      const hi = withCpr[withCpr.length - 1];
      working.push(`${lo.a.platform} is the most efficient platform at ${money(lo.cpr)} per ${unit}, against ${money(hi.cpr)} on ${hi.a.platform}.`);
      rec(4, `Weigh the budget split between platforms: ${lo.a.platform} produces ${unit}s at ${money(lo.cpr)} each and ${hi.a.platform} at ${money(hi.cpr)}. Before moving money, check that both count ${unit}s the same way, because each platform uses its own attribution.`);
    }
  }

  // --- Period over period ---------------------------------------------------
  if (p && pd) {
    const prevResults = unit ? resultsOf(p, unit) : 0;
    const resCh = unit && prevResults > 0 ? pctChange(results, prevResults) : null;
    const cprCh = avgCpr !== null && unit && prevResults > 0 ? pctChange(avgCpr, p.costMinor / prevResults) : null;
    if (resCh !== null && resCh >= 10) working.push(`${unit === "lead" ? "Leads" : "Conversions"} rose ${pctText(resCh)} to ${formatNumber(results, results < 100 ? 1 : 0)}${cprCh !== null && cprCh < 0 ? `, while cost per ${unit} fell ${pctText(cprCh)}` : ""}.`);
    else if (resCh !== null && resCh <= -10) notWorking.push(`${unit === "lead" ? "Leads" : "Conversions"} fell ${pctText(resCh)} to ${formatNumber(results, results < 100 ? 1 : 0)} compared with the previous period.`);
    if (cprCh !== null && cprCh >= 15) notWorking.push(`Cost per ${unit} rose ${pctText(cprCh)} to ${money(avgCpr!)}.`);
    else if (cprCh !== null && cprCh <= -15 && !(resCh !== null && resCh >= 10)) working.push(`Cost per ${unit} improved ${pctText(cprCh)} to ${money(avgCpr!)}.`);
    const ctrCh = d.ctr !== null && pd.ctr !== null ? pctChange(d.ctr, pd.ctr) : null;
    if (ctrCh !== null && ctrCh <= -15) {
      notWorking.push(`Click-through rate fell ${pctText(ctrCh)} to ${formatPct(d.ctr, 2)}, so the ads are drawing fewer clicks per impression.`);
      rec(4, `Refresh ad copy and creative: click-through rate dropped from ${formatPct(pd.ctr, 2)} to ${formatPct(d.ctr, 2)}. Test new headlines and offers, and check whether new competitors or ad fatigue are to blame.`);
    } else if (ctrCh !== null && ctrCh >= 15) {
      working.push(`Click-through rate improved ${pctText(ctrCh)} to ${formatPct(d.ctr, 2)}, so the ads are earning more attention.`);
    }
    const cpcCh = d.cpcMinor !== null && pd.cpcMinor !== null ? pctChange(d.cpcMinor, pd.cpcMinor) : null;
    if (cpcCh !== null && cpcCh >= 15) {
      notWorking.push(`Cost per click rose ${pctText(cpcCh)} to ${formatMoney(d.cpcMinor!, c)}, so each visit is getting more expensive.`);
      rec(4, `Review bids and competition: cost per click went from ${formatMoney(pd.cpcMinor!, c)} to ${formatMoney(d.cpcMinor!, c)}. Check for new competitors in the auction, pause expensive low-converting keywords or placements, and improve ad relevance to bring click costs down.`);
    } else if (ctrCh !== null && ctrCh > -15 && p.clicks > 0 && t.clicks >= p.clicks * 1.05 && (cpcCh === null || cpcCh <= 5)) {
      working.push(`Traffic grew: clicks rose ${pctText(pctChange(t.clicks, p.clicks)!)} to ${formatNumber(t.clicks)} while cost per click held at ${formatMoney(d.cpcMinor!, c)}.`);
    }
    const cvrCh = d.conversionRate !== null && pd.conversionRate !== null && unit === "conversion" ? pctChange(d.conversionRate, pd.conversionRate) : null;
    if (cvrCh !== null && cvrCh >= 10) working.push(`Conversion rate improved ${pctText(cvrCh)} to ${formatPct(d.conversionRate, 2)}, so more of the people who click are taking action.`);
    if (cvrCh !== null && cvrCh <= -10 && (ctrCh === null || ctrCh > -15)) {
      notWorking.push(`Conversion rate fell ${pctText(cvrCh)} to ${formatPct(d.conversionRate, 2)} while clicks held up, which points at the landing page or offer rather than the ads.`);
      rec(3, `Check the landing pages: conversion rate fell from ${formatPct(pd.conversionRate, 2)} to ${formatPct(d.conversionRate, 2)}. Look for broken forms, slow pages or a changed offer, and confirm conversion tracking still fires.`);
    }
  }

  // --- Return on ad spend ---------------------------------------------------
  const placeholderValue = hasPlaceholderValues(t);
  if (d.roas !== null && !placeholderValue) {
    if (d.roas >= 1) working.push(`Every ${formatMoney(100, c)} of ad spend returned ${formatMoney(Math.round(d.roas * 100), c)} in platform-reported conversion value.`);
    else {
      notWorking.push(`Reported conversion value (${money(t.conversionValueMinor)}) covers only ${formatPct(d.roas * 100, 0)} of ad spend.`);
      rec(3, `Improve return on ad spend: reported value covers only ${formatPct(d.roas * 100, 0)} of spend. Check that every valuable conversion is tracked with its value, then move budget toward the campaigns with the highest value per conversion.`);
    }
  }

  // --- Tracking -------------------------------------------------------------
  if (!unit && t.costMinor > 0) {
    notWorking.push(`${money(t.costMinor)} was spent with no conversions or leads reported.`);
    rec(1, "Set up or repair conversion tracking (calls, forms and bookings) so the platforms can report results and optimize toward them. Until then, success can only be judged on clicks.");
  }
  if (placeholderValue) {
    // Listed first: it changes how every value-based figure in the report should be read.
    notWorking.unshift(`Conversion value (${money(t.conversionValueMinor)}) is exactly one ${c === "USD" ? "dollar" : "unit"} per conversion, the ad platform's default, so return on ad spend (${formatNumber(d.roas ?? 0, 2)}×) doesn't reflect real revenue.`);
    rec(1, `Give conversions real values in the ad platform: the reported conversion value (${money(t.conversionValueMinor)}) equals one ${c === "USD" ? "dollar" : "unit"} per conversion, which is the platform default, so return on ad spend isn't meaningful yet.`);
  }

  // --- Budget ---------------------------------------------------------------
  const pc = i.pacing;
  if (pc && !i.pastBudget && i.range.to >= pc.periodStart) {
    const over = pc.forecastStatus.includes("OVER");
    const under = pc.forecastStatus.includes("UNDER");
    if (pc.forecastStatus === "ON_TARGET") {
      working.push(`The budget is on track: ${money(pc.actualToDateMinor)} of ${money(pc.budgetMinor)} spent, heading for ${money(pc.projectedMinor)} by month end.`);
    } else if (over || under) {
      notWorking.push(`The budget is on course to ${over ? "overspend" : "underspend"}: projected ${money(pc.projectedMinor)} against ${money(pc.budgetMinor)}.`);
      if (pc.requiredDailyMinor !== null && pc.remainingActiveDays > 0) {
        rec(2, `${over ? "Lower" : "Raise"} daily spend from about ${money(pc.currentDailyRateMinor)} to ${money(pc.requiredDailyMinor)} for the remaining ${pc.remainingActiveDays} days to land on the ${money(pc.budgetMinor)} budget.${under && best ? ` Put the extra toward ${best.label}.` : ""}`);
      }
    }
  } else if (i.pastBudget) {
    const b = i.pastBudget;
    const ratio = b.budgetMinor ? b.spentMinor / b.budgetMinor : null;
    if (ratio !== null && ratio >= 0.95 && ratio <= 1.05) working.push(`${b.month} closed on budget: ${money(b.spentMinor)} of ${money(b.budgetMinor)}.`);
    else if (ratio !== null) {
      notWorking.push(`${b.month} closed ${ratio > 1 ? "over" : "under"} budget: ${money(b.spentMinor)} against ${money(b.budgetMinor)} (${formatPct(ratio * 100, 0)}).`);
      const days = diffDays(i.range.from, i.range.to) + 1;
      rec(2, `${ratio > 1 ? "Rein in" : "Step up"} daily spend this month: ${b.month} ran ${formatPct(Math.abs(ratio - 1) * 100, 0)} ${ratio > 1 ? "over" : "under"} budget. At the same budget, campaign daily budgets should add up to about ${money(Math.round(b.budgetMinor / days))} a day.`);
    }
  }

  // --- Data quality ---------------------------------------------------------
  const gaps = i.accounts.filter((a) => a.dataNote);
  for (const a of gaps.slice(0, 2)) notWorking.push(`${a.platform} · ${a.name} is ${a.dataNote}, so these figures may be incomplete.`);
  if (gaps.length) rec(1, `Reconnect ${gaps.map((a) => `${a.platform} · ${a.name}`).join(" and ")} on the Ad accounts page so the report is complete.`);

  if (!recs.length && !notWorking.length) rec(5, "Results are steady with no clear problem areas. Keep the current setup, and test one new ad or audience in the largest campaign to look for further gains.");
  return { working: working.slice(0, MAX_ITEMS), notWorking: notWorking.slice(0, MAX_ITEMS), recommendations: [...new Set([...recs].sort((a, b) => a.priority - b.priority).map((r) => r.text))].slice(0, MAX_RECS) };
}
