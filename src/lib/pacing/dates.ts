// Calendar-date helpers. Reporting dates are plain local dates ("YYYY-MM-DD")
// in the client's timezone; all arithmetic is done on UTC midnights so no DST
// or host-timezone effects can creep in.

export type IsoDate = string; // "YYYY-MM-DD"

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(d: string): asserts d is IsoDate {
  if (!ISO_RE.test(d) || Number.isNaN(toUtcMs(d))) {
    throw new Error(`Invalid ISO date: ${d}`);
  }
}

function toUtcMs(d: IsoDate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(d: IsoDate, n: number): IsoDate {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** Inclusive list of dates from start to end. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(d: IsoDate): number {
  return new Date(toUtcMs(d)).getUTCDay();
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}

/** The local calendar date in `timeZone` at instant `now`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function monthBounds(d: IsoDate): { start: IsoDate; end: IsoDate } {
  const [y, m] = d.split("-").map(Number);
  const start = fromUtcMs(Date.UTC(y, m - 1, 1));
  const end = fromUtcMs(Date.UTC(y, m, 0));
  return { start, end };
}

export function dateToIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function isoToDate(d: IsoDate): Date {
  return new Date(toUtcMs(d));
}
