import "server-only";
import { addDays, type IsoDate } from "@/lib/pacing/dates";
import type { MetricRow } from "../types";

export interface FetchOutcome {
  rows: MetricRow[];
  /** Non-fatal problems (deprecated metric, posts unavailable). No tokens. */
  warnings: string[];
}

export const todayUtc = (now: Date): IsoDate => now.toISOString().slice(0, 10);

/** Point-in-time values (followers) are stored on the sync date only, never on backfilled history. */
export const isRecent = (to: IsoDate, now: Date) => to >= addDays(todayUtc(now), -1);

/** Calendar date of a Graph timestamp ("2026-10-01T15:04:05+0000") in a time zone. */
export function dateInZone(ts: string, timeZone: string): IsoDate {
  const ms = Date.parse(ts.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (!Number.isFinite(ms)) return ts.slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
