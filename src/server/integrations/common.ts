import { addDays, todayInTimeZone, type IsoDate } from "@/lib/pacing/dates";

function localHour(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
}

/**
 * Yesterday once the local clock passes `afterHour`, otherwise the day before.
 * Platforms keep settling a day's numbers for a few hours after it ends; this
 * is a conservative heuristic, and recent days are re-fetched on every sync.
 */
export function completeThrough(timeZone: string, now: Date, afterHour: number): IsoDate {
  const today = todayInTimeZone(timeZone, now);
  return addDays(today, localHour(timeZone, now) >= afterHour ? -1 : -2);
}

/**
 * Exact decimal string (e.g. "12.345", "-0.5") → minor units, rounding half
 * away from zero. Avoids binary floating point for money.
 */
export function decimalToMinor(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  const s = String(value).trim().replace(/,/g, "");
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }
  const [, neg, whole = "", frac = ""] = m;
  const cents = BigInt(whole || "0") * 100n + BigInt((frac + "00").slice(0, 2));
  const roundUp = (frac[2] ?? "0") >= "5" ? 1n : 0n;
  const total = cents + roundUp;
  return Number(neg ? -total : total);
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}
