import { addDays, type IsoDate } from "./dates";

/** Google Ads bills a campaign at most this many times its average daily budget in a calendar month. */
export const GOOGLE_MONTHLY_DAILY_MULTIPLIER = 30.4;

/**
 * The most Google Ads can bill for a budget line this month, from the campaigns'
 * current daily budgets. Only for a whole calendar month on Google Ads (search,
 * not LSA) where every enabled campaign in scope has a known daily budget;
 * otherwise undefined and the forecast is left uncapped.
 *
 * Retired accounts (monitored: false) are ignored; their campaigns should not be
 * passed in.
 */
export function googleAdsSpendCap(
  periodStart: IsoDate,
  periodEnd: IsoDate,
  accounts: { platform: string; monitored: boolean }[],
  campaigns: { status: string; platformDailyBudgetMinor: bigint | number | null }[],
): number | undefined {
  const fullMonth =
    periodStart.endsWith("-01") && addDays(periodEnd, 1).endsWith("-01") && periodStart.slice(0, 7) === periodEnd.slice(0, 7);
  if (!fullMonth) return undefined;
  const live = accounts.filter((a) => a.monitored);
  if (live.length === 0 || live.some((a) => a.platform !== "GOOGLE_ADS")) return undefined;
  const enabled = campaigns.filter((c) => c.status === "ENABLED");
  if (enabled.length === 0 || enabled.some((c) => c.platformDailyBudgetMinor === null)) return undefined;
  const daily = enabled.reduce((s, c) => s + Number(c.platformDailyBudgetMinor), 0);
  return Math.round(daily * GOOGLE_MONTHLY_DAILY_MULTIPLIER);
}
