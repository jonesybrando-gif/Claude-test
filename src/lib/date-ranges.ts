import { addDays, assertIsoDate, diffDays, maxDate, minDate, monthBounds, type IsoDate } from "./pacing/dates";

export type RangePreset = "mtd" | "last_month" | "last_7" | "last_30" | "last_90" | "custom";
export type CompareMode = "previous_period" | "previous_month" | "none";

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export const PRESET_LABEL: Record<RangePreset, string> = {
  mtd: "Month to date",
  last_month: "Last month",
  last_7: "Last 7 days",
  last_30: "Last 30 days",
  last_90: "Last 90 days",
  custom: "Custom",
};

/**
 * The label for a resolved range: the preset's name, except "Month to date"
 * on the 1st of a month, which shows last month and says so.
 */
export function rangeLabel(preset: RangePreset, range: DateRange): string {
  if (preset === "mtd" && range.from === monthBounds(range.from).start && range.to === monthBounds(range.from).end) return "Month to date (showing last month: this month has no complete day yet)";
  return PRESET_LABEL[preset];
}

/**
 * Resolve a preset against the client's local today. Ranges end on the last
 * complete day (yesterday) because today's data is partial.
 */
export function resolveRange(preset: RangePreset, today: IsoDate, custom?: Partial<DateRange>): DateRange {
  const yesterday = addDays(today, -1);
  switch (preset) {
    case "mtd": {
      const { start } = monthBounds(today);
      // On the 1st there is no complete day this month yet, so show last month (see rangeLabel).
      if (today === start) return resolveRange("last_month", today);
      return { from: start, to: yesterday };
    }
    case "last_month": {
      const prev = monthBounds(addDays(monthBounds(today).start, -1));
      return { from: prev.start, to: prev.end };
    }
    case "last_7":
      return { from: addDays(yesterday, -6), to: yesterday };
    case "last_30":
      return { from: addDays(yesterday, -29), to: yesterday };
    case "last_90":
      return { from: addDays(yesterday, -89), to: yesterday };
    case "custom": {
      if (!custom?.from || !custom?.to) return resolveRange("mtd", today);
      assertIsoDate(custom.from);
      assertIsoDate(custom.to);
      const from = minDate(custom.from, custom.to);
      const to = maxDate(custom.from, custom.to);
      if (diffDays(from, to) > 730) throw new Error("Date range is limited to two years");
      return { from, to };
    }
  }
}

/**
 * previous_period: the same number of days immediately before.
 * previous_month: the same day-of-month span one month earlier, clipped to that
 * month's length (e.g. Mar 1–31 → Feb 1–28). Ranges spanning months shift by a
 * calendar month at each end.
 */
export function comparisonRange(range: DateRange, mode: CompareMode): DateRange | null {
  if (mode === "none") return null;
  if (mode === "previous_period") {
    const len = diffDays(range.from, range.to) + 1;
    return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
  }
  return { from: shiftMonth(range.from, -1), to: shiftMonth(range.to, -1) };
}

function shiftMonth(d: IsoDate, n: number): IsoDate {
  const [y, m, day] = d.split("-").map(Number);
  const firstOfTarget = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
  const { end } = monthBounds(firstOfTarget);
  const lastDay = Number(end.slice(8));
  return `${firstOfTarget.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
