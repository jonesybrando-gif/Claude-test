// Scheduled client reports: when the next one is due. Pure, so it can be
// tested without a database. Reports go out at SEND_HOUR in the client's time
// zone, monthly on a day of the month (1–28, so every month has it) or weekly
// on a weekday.

import { addDays, dayOfWeek, todayInTimeZone, type IsoDate } from "./pacing/dates";

export type ScheduleFrequency = "monthly" | "weekly";
export const SEND_HOUR = 8;
export const SCHEDULE_RANGES = ["last_month", "mtd", "last_7", "last_30"] as const;
export type ScheduleRange = (typeof SCHEDULE_RANGES)[number];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ScheduleRule {
  frequency: ScheduleFrequency;
  /** 1–28, for monthly */
  dayOfMonth: number | null;
  /** 0 = Sunday … 6 = Saturday, for weekly */
  dayOfWeek: number | null;
}

/** Offset of `timeZone` from UTC at `at`, in ms (positive east of UTC). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a local wall-clock time on `date` occurs in `timeZone`. */
export function zonedTime(date: IsoDate, hour: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const first = guess - tzOffsetMs(timeZone, new Date(guess));
  // Re-check once in case the guess and the answer straddle a DST change.
  return new Date(guess - tzOffsetMs(timeZone, new Date(first)));
}

export function matchesRule(rule: ScheduleRule, date: IsoDate): boolean {
  return rule.frequency === "monthly" ? Number(date.slice(8)) === rule.dayOfMonth : dayOfWeek(date) === rule.dayOfWeek;
}

/** The first send time strictly after `after`. */
export function nextRunAt(rule: ScheduleRule, timeZone: string, after: Date): Date {
  let d = addDays(todayInTimeZone(timeZone, after), -1);
  for (let i = 0; i < 70; i++, d = addDays(d, 1)) {
    if (!matchesRule(rule, d)) continue;
    const at = zonedTime(d, SEND_HOUR, timeZone);
    if (at > after) return at;
  }
  throw new Error("No matching date for this schedule");
}

export function describeSchedule(rule: ScheduleRule): string {
  if (rule.frequency === "weekly") return `Every ${WEEKDAYS[rule.dayOfWeek ?? 1]} at ${SEND_HOUR}:00`;
  const n = rule.dayOfMonth ?? 1;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `Monthly on the ${n}${suffix} at ${SEND_HOUR}:00`;
}

/** Splits and checks a comma/space/newline separated list of email addresses. */
export function parseRecipients(raw: string): { emails: string[]; invalid: string[] } {
  const items = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const ok = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
  return { emails: [...new Set(items.filter(ok).map((e) => e.toLowerCase()))], invalid: items.filter((e) => !ok(e)) };
}
