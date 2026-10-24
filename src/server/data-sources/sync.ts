import "server-only";
import { prisma } from "../db";
import { addDays, todayInTimeZone, type IsoDate, isoToDate, dateToIso } from "@/lib/pacing/dates";
import { isMetricKey } from "@/lib/metrics-registry";
import { getDataSourceAdapter } from "./registry";
import { dataSourceAccessToken, markDataSourceNeedsReauth, readSecret } from "./credentials";
import type { MetricRow } from "./types";

// Generic runner for non-ad data sources. Called hourly by the scheduler and
// /api/cron/sync next to the ad-account sync. Each asset is synced at most
// once per SYNC_INTERVAL; the first sync imports backfillDays of history.

export const DATA_SYNC_INTERVAL_MS = 55 * 60 * 1000;
const CHUNK_DAYS = 90;

export interface DataSyncResult { assetId: string; status: "SUCCEEDED" | "FAILED" | "SKIPPED"; rows: number; error?: string }

/** Replace stored rows for [from, to] with `rows` (idempotent). Unknown metric keys are dropped. */
export async function writeMetricRows(assetId: string, clientId: string, from: IsoDate, to: IsoDate, rows: MetricRow[]): Promise<number> {
  const clean = rows.filter((r) => isMetricKey(r.metric) && Number.isFinite(r.value) && r.date >= from && r.date <= to);
  await prisma.$transaction([
    prisma.metricDaily.deleteMany({ where: { assetId, date: { gte: isoToDate(from), lte: isoToDate(to) } } }),
    prisma.metricDaily.createMany({
      data: clean.map((r) => ({ assetId, clientId, date: isoToDate(r.date), metric: r.metric, dimension: r.dimension ?? "", dimensionValue: (r.dimensionValue ?? "").slice(0, 500), value: r.value })),
      skipDuplicates: true,
    }),
  ]);
  return clean.length;
}

/**
 * Assets being synced in this process. The in-process scheduler, /api/cron/sync
 * and the after() syncs started by link/rank actions can otherwise run the same
 * asset at once (double API spend, e.g. duplicate DataForSEO tasks).
 */
function inFlight(): Set<string> {
  const g = globalThis as { __pmDataSyncInFlight?: Set<string> };
  return (g.__pmDataSyncInFlight ??= new Set());
}

export async function syncDataAsset(assetId: string, opts: { force?: boolean; now?: Date } = {}): Promise<DataSyncResult> {
  const running = inFlight();
  if (running.has(assetId)) return { assetId, status: "SKIPPED", rows: 0, error: "Already syncing." };
  running.add(assetId);
  try {
    return await syncDataAssetOnce(assetId, opts);
  } finally {
    running.delete(assetId);
  }
}

async function syncDataAssetOnce(assetId: string, opts: { now?: Date }): Promise<DataSyncResult> {
  const asset = await prisma.dataAsset.findUnique({ where: { id: assetId }, include: { connection: true, client: { select: { timezone: true, archivedAt: true } } } });
  if (!asset || !asset.connection || asset.client.archivedAt) return { assetId, status: "SKIPPED", rows: 0 };
  // "Don't monitor" / paused rank projects and disconnected logins never sync (no API spend).
  if (asset.status === "DISCONNECTED" || asset.connection.status === "DISCONNECTED") return { assetId, status: "SKIPPED", rows: 0 };
  const adapter = getDataSourceAdapter(asset.connection.provider);
  if (!adapter) return { assetId, status: "SKIPPED", rows: 0, error: "No adapter for this source yet." };
  const now = opts.now ?? new Date();
  await prisma.dataAsset.update({ where: { id: assetId }, data: { lastSyncAttemptAt: now } });
  try {
    // Inside the try: a bad stored time zone must fail this asset only, not the whole run.
    const tz = asset.timezone ?? asset.client.timezone;
    const to = todayInTimeZone(tz, now);
    const win = adapter.windowFor?.(asset) ?? {};
    const refetchDays = win.refetchDays ?? adapter.refetchDays ?? 3;
    const backfillDays = win.backfillDays ?? adapter.backfillDays ?? 395;
    const from = asset.dataCompleteThrough ? addDays(dateToIso(asset.dataCompleteThrough), -refetchDays) : addDays(to, -backfillDays);
    const accessToken = await dataSourceAccessToken(asset.connection, adapter);
    const secret = readSecret(asset.connection);
    let rows = 0;
    if (adapter.syncAsset) {
      rows = (await adapter.syncAsset({ connection: asset.connection, asset, accessToken, secret, from, to })).rows;
    } else {
      for (let start = from; start <= to; start = addDays(start, CHUNK_DAYS)) {
        const end = addDays(start, CHUNK_DAYS - 1) < to ? addDays(start, CHUNK_DAYS - 1) : to;
        const fetched = await adapter.fetchMetrics({ connection: asset.connection, asset, accessToken, secret, from: start, to: end });
        rows += await writeMetricRows(asset.id, asset.clientId, start, end, fetched);
      }
    }
    await prisma.dataAsset.update({ where: { id: assetId }, data: { lastSuccessfulSyncAt: new Date(), dataCompleteThrough: isoToDate(addDays(to, -1)), status: "ACTIVE", lastError: null } });
    return { assetId, status: "SUCCEEDED", rows };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    const auth = /invalid_grant|unauthori[sz]ed|401|revoked|expired/i.test(msg);
    if (auth) await markDataSourceNeedsReauth(asset.connection.id, msg);
    await prisma.dataAsset.update({ where: { id: assetId }, data: { lastError: msg.slice(0, 500), ...(auth ? { status: "NEEDS_REAUTH" as const } : {}) } });
    return { assetId, status: "FAILED", rows: 0, error: msg.slice(0, 500) };
  }
}

/**
 * Syncs assets that are due, oldest attempt first. `deadline` (epoch ms): no
 * new asset starts after it, so a large first backfill can't hold up the
 * caller's other work or run past a request time limit; the rest are picked
 * up next hour. Each asset is claimed atomically, so two runners (in-process
 * scheduler and /api/cron/sync, or two instances) don't sync it twice.
 */
export async function syncDueDataAssets(opts: { now?: Date; limit?: number; deadline?: number } = {}): Promise<DataSyncResult[]> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - DATA_SYNC_INTERVAL_MS);
  const dueWhere = { OR: [{ lastSyncAttemptAt: null }, { lastSyncAttemptAt: { lt: cutoff } }] };
  const due = await prisma.dataAsset.findMany({
    where: { status: { not: "DISCONNECTED" }, connection: { status: "ACTIVE" }, client: { archivedAt: null }, ...dueWhere },
    select: { id: true },
    orderBy: { lastSyncAttemptAt: { sort: "asc", nulls: "first" } },
    take: opts.limit ?? 200,
  });
  const out: DataSyncResult[] = [];
  for (const a of due) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    try {
      const startedAt = new Date();
      const claimed = await prisma.dataAsset.updateMany({ where: { id: a.id, ...dueWhere }, data: { lastSyncAttemptAt: startedAt } });
      if (claimed.count === 0) continue; // another runner took it
      out.push(await syncDataAsset(a.id, { now: startedAt }));
    } catch (e) {
      // One asset (or a DB hiccup) never stops the rest.
      out.push({ assetId: a.id, status: "FAILED", rows: 0, error: ((e as Error)?.message ?? String(e)).slice(0, 500) });
    }
  }
  return out;
}
