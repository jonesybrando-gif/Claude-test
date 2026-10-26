// "Results": the one headline number a client is judged on, built from the
// client's goal (Client.goal) using ad-platform data only.
//
// How platforms count leads and conversions (see the ad adapters):
//   - Meta: conversions = leads + purchases + calls placed, so Meta leads are
//     already inside Meta conversions.
//   - Google Local Services: leads = every lead created; conversions = charged
//     leads only, a subset of those leads.
//   - Google Ads and Microsoft Advertising: conversions only (leads are 0).
// So for any single platform the union of the two is simply the larger of
// conversions and leads, and adding conversions + leads would double count.
// Results for a blend of platforms are the sum of each platform's (or ad
// account's, or campaign's) own larger figure, never max() of blended totals.
//
// CallRail calls are deliberately not added: ad platforms usually count the
// same calls as conversions already. They are shown alongside as a supporting
// figure ("Calls from ads (CallRail)").

import type { ClientGoal } from "@prisma/client";
import { diffDays, type IsoDate } from "./pacing/dates";
import { emptyTotals, addInto, type MetricTotals } from "./metrics";

export type ResultsGoal = ClientGoal;

export type ResultsLabel = "Leads" | "Calls" | "Sales" | "Bookings" | "Clicks" | "Results";

export interface Results {
  goal: ResultsGoal;
  /** True when the client has no goal set and it was worked out from the data. */
  guessed: boolean;
  label: ResultsLabel;
  /** "lead", "call", "sale", "booking", "click" or "result". */
  singular: string;
  /** The headline number: leads, calls, sales, bookings, or clicks for awareness. */
  value: number;
  /** Spend the results were bought with (minor units), so results can be summed across clients. */
  costMinor: number;
  /** Spend ÷ results, or null with no results. */
  costPerMinor: number | null;
  /** Platform-reported sales value (minor units); only for the sales goal when real values are tracked. */
  valueMinor?: number;
}

const LABELS: Record<ResultsGoal, { label: ResultsLabel; singular: string }> = {
  LEADS: { label: "Leads", singular: "lead" },
  CALLS: { label: "Calls", singular: "call" },
  SALES: { label: "Sales", singular: "sale" },
  BOOKINGS: { label: "Bookings", singular: "booking" },
  AWARENESS: { label: "Clicks", singular: "click" },
};

export const GOAL_OPTIONS: { value: ResultsGoal; label: string; hint: string }[] = [
  { value: "LEADS", label: "Leads", hint: "Enquiries: form fills, lead forms and calls counted by the ad platforms." },
  { value: "CALLS", label: "Phone calls", hint: "Calls from the ads, as counted by the ad platforms." },
  { value: "SALES", label: "Online sales", hint: "Purchases, with their value when the ad platforms track it." },
  { value: "BOOKINGS", label: "Bookings", hint: "Appointments or reservations counted as conversions." },
  { value: "AWARENESS", label: "Awareness", hint: "Getting seen and visited; judged on people who clicked." },
];

export const isClientGoal = (v: unknown): v is ResultsGoal => typeof v === "string" && v in LABELS;

/**
 * True when conversion value is exactly one currency unit per conversion: the
 * ad platform's default when no real values are set, so value and ROAS mean nothing.
 */
export function hasPlaceholderValues(t: MetricTotals): boolean {
  return t.conversions >= 5 && t.conversionValueMinor > 0 && Math.abs(t.conversionValueMinor / t.conversions - 100) < 1;
}

/**
 * Real conversion values are tracked: not missing, not the $1 placeholder, and
 * big enough to mean something (at least 20% of spend; a few dollars of value on
 * thousands of spend is a leftover setting, not sales tracking).
 */
export const tracksValue = (t: MetricTotals): boolean => t.conversionValueMinor > 0 && !hasPlaceholderValues(t) && t.conversionValueMinor >= t.costMinor * 0.2;

/** Results of ONE platform's line (an ad account or a campaign): the larger of conversions and leads. */
export const lineResults = (t: MetricTotals): number => Math.max(t.conversions, t.leads);

const asLines = (t: MetricTotals | MetricTotals[]): MetricTotals[] => (Array.isArray(t) ? t : [t]);
const sum = (lines: MetricTotals[]): MetricTotals => lines.reduce((acc, l) => addInto(acc, l), emptyTotals());

/**
 * The goal to report on: the client's own, or a guess from the data. Sales
 * when real conversion values are tracked; leads when any conversions or
 * leads are tracked; awareness when nothing is.
 */
export function resolveGoal(goal: ResultsGoal | null | undefined, ...samples: (MetricTotals | MetricTotals[] | null | undefined)[]): { goal: ResultsGoal; guessed: boolean } {
  if (goal) return { goal, guessed: false };
  const all = sum(samples.flatMap((s) => (s ? asLines(s) : [])));
  if (tracksValue(all)) return { goal: "SALES", guessed: true };
  if (all.conversions > 0 || all.leads > 0 || all.leadsReported) return { goal: "LEADS", guessed: true };
  return { goal: "AWARENESS", guessed: true };
}

/**
 * Results for a goal. Pass one MetricTotals per platform line (ad account or
 * campaign) so leads and conversions are combined per platform without double
 * counting; a single MetricTotals is treated as one platform's line.
 * A null goal is guessed from these totals (pass `resolveGoal` first to guess
 * from both periods, and its `guessed` flag as the third argument). A guessed
 * goal other than awareness is labelled "Results".
 */
export function resultsFor(goal: ResultsGoal | null | undefined, totals: MetricTotals | MetricTotals[], guessed = !goal): Results {
  const lines = asLines(totals);
  const g = goal ?? resolveGoal(null, lines).goal;
  const all = sum(lines);
  const value = g === "AWARENESS" ? all.clicks : lines.reduce((n, l) => n + lineResults(l), 0);
  return {
    goal: g,
    guessed,
    // A guessed goal is called "Results": the platforms' conversions may be leads, calls or sales.
    ...(guessed && g !== "AWARENESS" ? { label: "Results" as const, singular: "result" } : LABELS[g]),
    value,
    costMinor: all.costMinor,
    costPerMinor: value > 0 ? all.costMinor / value : null,
    ...(g === "SALES" && tracksValue(all) ? { valueMinor: all.conversionValueMinor } : {}),
  };
}

/**
 * Totals across several clients (e.g. the agency Home): spend and results
 * summed, labelled with the shared goal's name when every client has the
 * same goal, otherwise "Results". Awareness clients count clicks, which are
 * not results, so they are left out of the sum when other goals are present.
 */
export function portfolioResults(items: Results[]): Results {
  const goals = [...new Set(items.map((r) => r.goal))];
  const counted = goals.length > 1 ? items.filter((r) => r.goal !== "AWARENESS") : items;
  const value = counted.reduce((n, r) => n + r.value, 0);
  const costMinor = counted.reduce((n, r) => n + r.costMinor, 0);
  const one = goals.length === 1 ? goals[0] : null;
  return {
    goal: one ?? "LEADS",
    guessed: items.some((r) => r.guessed),
    ...(one ? LABELS[one] : { label: "Results" as const, singular: "result" }),
    value,
    costMinor,
    costPerMinor: value > 0 ? costMinor / value : null,
  };
}

/** Plain definition of a Results figure, for its ⓘ. */
export function resultsDefinition(r: Pick<Results, "goal" | "guessed" | "label">): string {
  const guess = r.guessed ? " Your agency hasn't set a goal for this account yet, so it was chosen from the data." : "";
  if (r.goal === "AWARENESS") return `People who clicked your ads, as counted by each ad platform.${guess}`;
  return `${r.label === "Results" ? "Results" : r.label} counted by the ad platforms: their conversions (or leads, for Meta and Local Services), with nothing counted twice. Calls tracked separately (CallRail) aren't added in, because the ad platforms usually count the same calls.${guess}`;
}

/** Days after a date during which ad platforms may still add late-counted results. */
export const LATE_COUNT_DAYS = 14;

/** True when a range ends recently enough that its result figures may still rise. */
export function stillCounting(rangeTo: IsoDate, today: IsoDate): boolean {
  return diffDays(rangeTo, today) <= LATE_COUNT_DAYS;
}
