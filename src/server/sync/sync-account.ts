import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { addDays, isoToDate, minDate, dateToIso, todayInTimeZone, type IsoDate } from "@/lib/pacing/dates";
import { getAdapter } from "../integrations/registry";
import { IntegrationError, withRetry, type RetryOptions } from "../integrations/errors";
import { markConnectionNeedsReauth, withAccessToken } from "../integrations/tokens";
import type { PlatformAdapter, RemoteCampaign } from "../integrations/types";

/** A RUNNING sync younger than this blocks another sync of the same account. */
const LOCK_MS = 30 * 60 * 1000;
/** Max days per API request when importing history. */
const CHUNK_DAYS = 92;
/** Scheduled syncs skip accounts attempted more recently than this. */
export const SYNC_INTERVAL_MS = 55 * 60 * 1000;

export type SyncKind = "scheduled" | "manual" | "backfill";

export interface SyncResult {
  accountId: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  rowsUpserted: number;
  range?: { from: IsoDate; to: IsoDate };
  error?: string;
}

export interface SyncDeps {
  adapter?: PlatformAdapter;
  /** Supplies an access token to `fn` (defaults to stored, auto-refreshed OAuth tokens). */
  withToken?: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
  retry?: RetryOptions;
  now?: Date;
}

export function chunkRange(from: IsoDate, to: IsoDate, maxDays = CHUNK_DAYS): { from: IsoDate; to: IsoDate }[] {
  const out: { from: IsoDate; to: IsoDate }[] = [];
  for (let start = from; start <= to; start = addDays(start, maxDays)) {
    out.push({ from: start, to: minDate(addDays(start, maxDays - 1), to) });
  }
  return out;
}

/**
 * Which dates to (re)fetch. First sync or backfill: the adapter's full history
 * window. Otherwise: from `restatementWindowDays` before the last complete
 * date, through today (today's partial numbers are stored but never paced on).
 */
export function syncRange(adapter: PlatformAdapter, today: IsoDate, kind: SyncKind, dataCompleteThrough: IsoDate | null): { from: IsoDate; to: IsoDate } {
  if (kind === "backfill" || !dataCompleteThrough) return { from: addDays(today, -adapter.initialBackfillDays), to: today };
  return { from: addDays(minDate(dataCompleteThrough, today), -adapter.restatementWindowDays), to: today };
}

async function upsertCampaigns(accountId: string, campaigns: RemoteCampaign[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const c of campaigns) {
    const row = await prisma.campaign.upsert({
      where: { accountId_externalId: { accountId, externalId: c.externalId } },
      create: { accountId, externalId: c.externalId, name: c.name, status: c.status, platformDailyBudgetMinor: c.dailyBudgetMinor === undefined ? null : BigInt(c.dailyBudgetMinor) },
      update: { name: c.name, status: c.status, ...(c.dailyBudgetMinor === undefined ? {} : { platformDailyBudgetMinor: BigInt(c.dailyBudgetMinor) }) },
      select: { id: true },
    });
    ids.set(c.externalId, row.id);
  }
  return ids;
}

export async function syncAccount(accountId: string, kind: SyncKind, deps: SyncDeps = {}): Promise<SyncResult> {
  const now = deps.now ?? new Date();
  const account = await prisma.adAccount.findUnique({ where: { id: accountId }, include: { client: { select: { timezone: true } }, connection: true } });
  if (!account) return { accountId, status: "FAILED", rowsUpserted: 0, error: "Account not found" };
  if (account.isDemo) return { accountId, status: "SKIPPED", rowsUpserted: 0, error: "Demo accounts are never synced" };
  if (!account.connectionId || !account.connection) return { accountId, status: "FAILED", rowsUpserted: 0, error: "Account has no platform connection" };

  const running = await prisma.syncRun.findFirst({ where: { accountId, status: "RUNNING", startedAt: { gt: new Date(now.getTime() - LOCK_MS) } } });
  if (running) return { accountId, status: "SKIPPED", rowsUpserted: 0, error: "A sync is already running for this account" };

  const adapter = deps.adapter ?? getAdapter(account.platform);
  if (!adapter) return { accountId, status: "FAILED", rowsUpserted: 0, error: `No integration for ${account.platform}` };
  const connectionId = account.connectionId;
  const withToken = deps.withToken ?? (<T,>(fn: (t: string) => Promise<T>) => withAccessToken(connectionId, adapter, fn));
  const call = <T,>(fn: (t: string) => Promise<T>) => withRetry(() => withToken(fn), deps.retry);

  const tz = account.timezone ?? account.client.timezone;
  const today = todayInTimeZone(tz, now);
  const range = syncRange(adapter, today, kind, account.dataCompleteThrough ? dateToIso(account.dataCompleteThrough) : null);
  const run = await prisma.syncRun.create({ data: { accountId, kind, status: "RUNNING", rangeStart: isoToDate(range.from), rangeEnd: isoToDate(range.to), startedAt: now } });
  await prisma.adAccount.update({ where: { id: accountId }, data: { lastSyncAttemptAt: now } });

  const ref = { externalId: account.externalId, loginCustomerId: account.loginCustomerId, timezone: tz };
  let rowsUpserted = 0;
  try {
    const campaignIds = await upsertCampaigns(accountId, await call((t) => adapter.listCampaigns(t, ref)));

    for (const chunk of chunkRange(range.from, range.to)) {
      const { rows, campaigns } = await call((t) => adapter.fetchDailyPerformance(t, ref, chunk.from, chunk.to));
      // Campaigns that only appear in metrics (e.g. removed ones that spent earlier in the range)
      const unseen = campaigns.filter((c) => !campaignIds.has(c.externalId));
      for (const [k, v] of await upsertCampaigns(accountId, unseen)) campaignIds.set(k, v);

      // Only accept rows inside the window being replaced; anything else would
      // collide with rows kept outside the window.
      const inWindow = rows.filter((r) => r.date >= chunk.from && r.date <= chunk.to);
      const data: Prisma.DailyPerformanceCreateManyInput[] = inWindow.map((r) => ({
        accountId,
        campaignId: r.campaignExternalId ? campaignIds.get(r.campaignExternalId)! : null,
        date: isoToDate(r.date),
        currency: account.currency,
        costMinor: BigInt(r.costMinor),
        costIsEstimated: r.costIsEstimated,
        impressions: BigInt(r.impressions),
        clicks: BigInt(r.clicks),
        reach: r.reach === undefined ? null : BigInt(r.reach),
        conversions: r.conversions,
        conversionValueMinor: BigInt(r.conversionValueMinor),
        leads: r.leads ?? null,
        isDemo: false,
        syncedAt: now,
      }));
      // Replace the whole window atomically: restated days are updated, and days
      // that dropped to zero (absent from the API response) are cleared.
      await prisma.$transaction([
        prisma.dailyPerformance.deleteMany({ where: { accountId, date: { gte: isoToDate(chunk.from), lte: isoToDate(chunk.to) } } }),
        prisma.dailyPerformance.createMany({ data }),
      ]);
      rowsUpserted += data.length;
    }

    const completeThrough = adapter.dataCompleteThrough(tz, now);
    await prisma.$transaction([
      prisma.adAccount.update({
        where: { id: accountId },
        data: { lastSuccessfulSyncAt: now, dataCompleteThrough: isoToDate(completeThrough), status: "ACTIVE", spendIsVerified: adapter.spendIsVerified },
      }),
      prisma.syncRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", rowsUpserted, finishedAt: new Date() } }),
      prisma.platformConnection.update({ where: { id: connectionId }, data: { status: "ACTIVE", lastError: null } }),
    ]);
    return { accountId, status: "SUCCEEDED", rowsUpserted, range };
  } catch (e) {
    const err = e instanceof IntegrationError ? e : new IntegrationError("INVALID_REQUEST", (e as Error).message);
    if (err.kind === "AUTH_REVOKED") await markConnectionNeedsReauth(connectionId, err.message);
    if (err.kind === "PERMISSION_DENIED") await prisma.adAccount.update({ where: { id: accountId }, data: { status: "DISCONNECTED" } });
    if (err.kind === "NOT_APPROVED") {
      await prisma.platformConnection.update({ where: { id: connectionId }, data: { status: "PENDING_APPROVAL", lastError: err.message } });
    }
    const status = rowsUpserted > 0 ? "PARTIAL" : "FAILED";
    const message = `${err.kind}: ${err.message}`.slice(0, 2000);
    await prisma.syncRun.update({ where: { id: run.id }, data: { status, rowsUpserted, error: message, finishedAt: new Date() } });
    return { accountId, status, rowsUpserted, range, error: message };
  }
}

/** Accounts due for a scheduled sync (live, connected, not attempted recently). */
export async function dueAccountIds(now: Date = new Date(), agencyId?: string): Promise<string[]> {
  const accounts = await prisma.adAccount.findMany({
    where: {
      isDemo: false,
      status: "ACTIVE",
      connection: { status: "ACTIVE", ...(agencyId ? { agencyId } : {}) },
      OR: [{ lastSyncAttemptAt: null }, { lastSyncAttemptAt: { lt: new Date(now.getTime() - SYNC_INTERVAL_MS) } }],
    },
    select: { id: true },
    orderBy: { lastSyncAttemptAt: { sort: "asc", nulls: "first" } },
  });
  return accounts.map((a) => a.id);
}

/** Sync due accounts with limited concurrency to stay within API rate limits. */
export async function syncDueAccounts(opts: { now?: Date; concurrency?: number; limit?: number } = {}): Promise<SyncResult[]> {
  const ids = (await dueAccountIds(opts.now)).slice(0, opts.limit ?? 200);
  const results: SyncResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      results.push(await syncAccount(id, "scheduled", { now: opts.now }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, ids.length) }, worker));
  return results;
}
