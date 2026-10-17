import { dayOfWeek, eachDay, type IsoDate } from "./dates";

export type DistributionConfig =
  | { mode: "EVEN" }
  | { mode: "BUSINESS_DAYS" }
  | { mode: "WEEKEND_WEIGHTED"; weekendWeight: number }
  | { mode: "CUSTOM_WEEKDAY"; weekdayWeights: number[] } // 7 values, Sunday first
  | { mode: "CUSTOM_DAILY"; dailyWeights: Record<IsoDate, number>; defaultWeight?: number };

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

export interface DistributionOptions {
  distribution: DistributionConfig;
  /** Days with no planned spend (temporary pauses). */
  pauses?: DateRange[];
}

function baseWeight(d: IsoDate, dist: DistributionConfig): number {
  const dow = dayOfWeek(d);
  const weekend = dow === 0 || dow === 6;
  switch (dist.mode) {
    case "EVEN":
      return 1;
    case "BUSINESS_DAYS":
      return weekend ? 0 : 1;
    case "WEEKEND_WEIGHTED":
      return weekend ? dist.weekendWeight : 1;
    case "CUSTOM_WEEKDAY":
      if (dist.weekdayWeights.length !== 7) {
        throw new Error("weekdayWeights must have 7 values (Sunday first)");
      }
      return dist.weekdayWeights[dow];
    case "CUSTOM_DAILY":
      return dist.dailyWeights[d] ?? dist.defaultWeight ?? 1;
  }
}

/**
 * Relative planned-spend weight for every day in [start, end]. A weight of 0
 * means no spend is planned that day. Weights are relative, not normalised.
 */
export function dayWeights(start: IsoDate, end: IsoDate, opts: DistributionOptions): Map<IsoDate, number> {
  const out = new Map<IsoDate, number>();
  for (const d of eachDay(start, end)) {
    let w = baseWeight(d, opts.distribution);
    if (!Number.isFinite(w) || w < 0) throw new Error(`Invalid weight ${w} for ${d}`);
    if (opts.pauses?.some((p) => d >= p.start && d <= p.end)) w = 0;
    out.set(d, w);
  }
  return out;
}
