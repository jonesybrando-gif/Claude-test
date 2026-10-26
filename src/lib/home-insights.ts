import { formatMoney, formatNumber } from "./money";
import { pctChange } from "./metrics";
import { MIN_RESULTS_TO_COMPARE, type PeriodResults } from "./portfolio";

export interface HomeInsight {
  eyebrow: string;
  headline: string;
  detail: string;
  action: { href: string; label: string };
}

export interface HomeInsightInput {
  currency: string;
  /** Agency totals, same currency only. */
  totals: { current: PeriodResults; previous: PeriodResults };
  /** Per client, in the agency currency only. */
  clients: { id: string; name: string; current: PeriodResults; previous: PeriodResults }[];
  /** Budget forecasts per client for the current period (negative = under). */
  budgets: { id: string; name: string; varianceMinor: number; off: boolean }[];
  /** "last month" or similar, for the sentences. */
  previousLabel: string;
}

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Up to three short findings for Home, worked out from the figures (no AI):
 * the change in results and who drove it, the change in cost per result and
 * why, and the largest budget misses. Each leads with the takeaway and adds a
 * cause or a next step, never just a number already on a tile.
 */
export function homeInsights(i: HomeInsightInput): HomeInsight[] {
  const out: HomeInsight[] = [];
  const { current: cur, previous: prev } = i.totals;
  const money = (m: number) => formatMoney(m, i.currency, { whole: true });
  const enough = cur.results >= MIN_RESULTS_TO_COMPARE && prev.results >= MIN_RESULTS_TO_COMPARE;

  // 1. Results, and the client behind most of the change.
  const resultsPct = enough ? pctChange(cur.results, prev.results) : null;
  if (resultsPct !== null && Math.abs(resultsPct) >= 5) {
    const down = resultsPct < 0;
    const net = cur.results - prev.results;
    const driver = [...i.clients]
      .map((c) => ({ ...c, delta: c.current.results - c.previous.results }))
      .filter((c) => (down ? c.delta < 0 : c.delta > 0))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    let why = "";
    if (driver) {
      const figures = `${formatNumber(driver.current.results, 0)} vs ${formatNumber(driver.previous.results, 0)}`;
      why = Math.abs(driver.delta) >= Math.abs(net) * 0.5 ? ` Most of the ${down ? "drop" : "gain"} is one client: ${driver.name} (${figures}).` : ` The biggest ${down ? "drop" : "gain"} is ${driver.name} (${figures}).`;
    }
    out.push({
      eyebrow: "Results",
      headline: `Results ${down ? "down" : "up"} ${Math.round(Math.abs(resultsPct))}% this month`,
      detail: `${formatNumber(cur.results, 0)} vs ${formatNumber(prev.results, 0)} at this point ${i.previousLabel}.${why}`,
      action: driver ? { href: `/clients/${driver.id}`, label: `Open ${driver.name}` } : { href: "/clients", label: "See clients" },
    });
  }

  // 2. Cost per result, and whether spend or results moved it.
  if (enough) {
    const cpr = cur.spendMinor / cur.results;
    const prevCpr = prev.spendMinor / prev.results;
    const cprPct = pctChange(cpr, prevCpr);
    const spendPct = pctChange(cur.spendMinor, prev.spendMinor);
    if (cprPct !== null && Math.abs(cprPct) >= 10) {
      const up = cprPct > 0;
      const flatSpend = spendPct === null || Math.abs(spendPct) < 5;
      const cause = flatSpend
        ? `Spend is about the same, so ${up ? "fewer" : "more"} results drove it.`
        : `Spend is ${spendPct! > 0 ? "up" : "down"} ${Math.round(Math.abs(spendPct!))}% and results ${resultsPct !== null && resultsPct < 0 ? "down" : "up"} ${Math.round(Math.abs(resultsPct ?? 0))}%.`;
      out.push({
        eyebrow: "Cost per result",
        headline: `Cost per result ${up ? "up" : "down"} ${Math.round(Math.abs(cprPct))}%`,
        detail: `${formatMoney(cpr, i.currency)} vs ${formatMoney(prevCpr, i.currency)} ${i.previousLabel}. ${cause}`,
        action: { href: "/clients?filter=attention", label: "See who needs attention" },
      });
    }
  }

  // 3. The largest budget misses, whichever direction is bigger.
  const off = i.budgets.filter((b) => b.off && b.varianceMinor !== 0);
  const under = off.filter((b) => b.varianceMinor < 0).sort((a, b) => a.varianceMinor - b.varianceMinor);
  const over = off.filter((b) => b.varianceMinor > 0).sort((a, b) => b.varianceMinor - a.varianceMinor);
  const sum = (xs: typeof off) => Math.abs(xs.reduce((s, b) => s + b.varianceMinor, 0));
  const pick = sum(under) >= sum(over) ? { xs: under, word: "under", verb: "leave", tail: "unspent" } : { xs: over, word: "over", verb: "go", tail: "over budget" };
  if (pick.xs.length) {
    const top = pick.xs.slice(0, 4);
    const n = top.length;
    out.push({
      eyebrow: "Budgets",
      headline: n === 1 ? `${top[0].name} is tracking ${pick.word} budget` : `Review ${n} large ${pick.word === "under" ? "underspends" : "overspends"}`,
      detail: `${list(top.map((b) => b.name))} ${n === 1 ? "is" : "are"} on track to ${pick.verb} about ${money(sum(top))} ${pick.tail} this month.${pick.word === "under" ? " Check the budgets are still right before raising spend." : ""}`,
      action: { href: `/clients?filter=${pick.word}`, label: "Review budgets" },
    });
  }
  return out.slice(0, 3);
}
