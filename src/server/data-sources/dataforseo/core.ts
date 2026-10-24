import "server-only";
import { domainMatches, type PendingRankTask, type RankDevice, type RankTaskError } from "@/lib/rankings";
import type { IsoDate } from "@/lib/pacing/dates";
import type { MetricRow } from "../types";
import {
  BALANCE_MESSAGE, DataForSeoError, getSerpTask, isBalanceCode, isNotReadyCode, postSerpTasks, readySerpTaskIds,
  type DfsTask, type FetchLike, type SerpResult, type SerpTaskInput,
} from "./api";

// Rank-check engine, independent of Prisma so it can be unit-tested with a
// mocked fetch and an in-memory store. ./adapter.ts wires it to the database.

export const BATCH_SIZE = 100;
export const SERP_DEPTH = 100;
/** Tasks not listed by tasks_ready after this long are fetched directly (tasks_ready lists at most 1000 per account). */
const DIRECT_FETCH_AFTER_MS = 2 * 60 * 60 * 1000;
/** Pending tasks older than this are dropped; the keyword is checked again on its next due day. */
const PENDING_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_TASK_ERRORS = 20;

export interface RankKeyword {
  id: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: RankDevice;
  targetDomain: string;
}

export interface ParsedRank {
  keywordId: string;
  date: IsoDate;
  position: number | null;
  url: string | null;
  serpFeatures: string[];
}

export interface RankStore {
  /** Active TrackedKeyword rows of the project. */
  activeKeywords(): Promise<RankKeyword[]>;
  /** Keyword ids that already have a KeywordRank for `date`. */
  checkedKeywordIds(date: IsoDate): Promise<Set<string>>;
  saveRanks(ranks: ParsedRank[]): Promise<void>;
  /** Stored positions for `date` (active keywords only). */
  ranksForDate(date: IsoDate): Promise<{ keywordId: string; position: number | null }[]>;
  writeSummary(date: IsoDate, rows: MetricRow[]): Promise<void>;
  saveState(state: { pendingTasks: PendingRankTask[]; taskErrors: RankTaskError[] }): Promise<void>;
}

export interface RankSyncInput {
  secret: string;
  /** Today in the asset's time zone; each keyword is checked at most once per such date. */
  today: IsoDate;
  pendingTasks: PendingRankTask[];
  store: RankStore;
  now?: Date;
  fetch?: FetchLike;
}

export interface RankSyncOutcome {
  collected: number;
  posted: number;
  pending: number;
  errors: RankTaskError[];
  /** Set when the run stopped because the DataForSEO balance ran out. */
  fatal?: string;
}

/** First organic result on the target domain (www and subdomains included) plus the SERP feature types present. */
export function parseSerpResult(result: SerpResult | null | undefined, targetDomain: string): { position: number | null; url: string | null; serpFeatures: string[] } {
  const items = result?.items ?? [];
  const features = new Set<string>(result?.item_types ?? []);
  for (const i of items) if (i?.type) features.add(i.type);
  const hit = items.find((i) => i?.type === "organic" && domainMatches(i.domain || i.url || "", targetDomain));
  const pos = hit ? (hit.rank_group ?? hit.rank_absolute ?? null) : null;
  return { position: typeof pos === "number" && pos > 0 ? pos : null, url: hit?.url ?? null, serpFeatures: [...features].sort() };
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Keywords that still need today's check: not checked today and no pending task for today. */
export function dueKeywords(keywords: RankKeyword[], checkedToday: Set<string>, pending: PendingRankTask[], today: IsoDate): RankKeyword[] {
  const pendingToday = new Set(pending.filter((p) => p.date === today).map((p) => p.keywordId));
  return keywords.filter((k) => !checkedToday.has(k.id) && !pendingToday.has(k.id));
}

/** Daily summary rows for MetricDaily. avgPosition is also derivable as positionSum / rankedCount. */
export function summaryMetrics(date: IsoDate, ranks: { position: number | null }[], tracked: number): MetricRow[] {
  const ranked = ranks.map((r) => r.position).filter((p): p is number => typeof p === "number" && p > 0);
  const sum = ranked.reduce((a, b) => a + b, 0);
  const within = (n: number) => ranked.filter((p) => p <= n).length;
  const rows: MetricRow[] = [
    { date, metric: "rank.tracked", value: tracked },
    { date, metric: "rank.rankedCount", value: ranked.length },
    { date, metric: "rank.positionSum", value: sum },
    { date, metric: "rank.top3", value: within(3) },
    { date, metric: "rank.top10", value: within(10) },
    { date, metric: "rank.top20", value: within(20) },
    { date, metric: "rank.top100", value: within(100) },
  ];
  if (ranked.length) rows.push({ date, metric: "rank.avgPosition", value: sum / ranked.length });
  return rows;
}

export function toSerpTask(k: RankKeyword): SerpTaskInput {
  return { keyword: k.keyword, location_code: k.locationCode, language_code: k.languageCode, device: k.device, depth: SERP_DEPTH, tag: k.id };
}

/**
 * One run: collect finished tasks, then post today's due keywords (Standard
 * queue). Results posted now are collected on a later hourly run. State is
 * always saved, even when the run stops early.
 */
export async function runRankSync(input: RankSyncInput): Promise<RankSyncOutcome> {
  const { secret, today, store } = input;
  const now = input.now ?? new Date();
  const f = input.fetch;
  const keywords = await store.activeKeywords();
  const byId = new Map(keywords.map((k) => [k.id, k]));
  const errors: RankTaskError[] = [];
  const err = (keyword: string, message: string) => errors.push({ keyword, message: message.slice(0, 300), at: now.toISOString() });
  let pending = input.pendingTasks.filter((p) => byId.has(p.keywordId) && now.getTime() - Date.parse(p.postedAt) < PENDING_MAX_AGE_MS);
  const touched = new Set<IsoDate>();
  let collected = 0;
  let posted = 0;
  let fatal: string | undefined;

  try {
    // 1. Collect finished tasks.
    if (pending.length) {
      const ready = await readySerpTaskIds(secret, f);
      const keep: PendingRankTask[] = [];
      const ranks: ParsedRank[] = [];
      for (const p of pending) {
        const old = now.getTime() - Date.parse(p.postedAt) > DIRECT_FETCH_AFTER_MS;
        if (!ready.has(p.id) && !old) { keep.push(p); continue; }
        const kw = byId.get(p.keywordId)!;
        let task: DfsTask<SerpResult>;
        try {
          task = await getSerpTask(secret, p.id, f);
        } catch (e) {
          if (e instanceof DataForSeoError && (e.code === 401 || isBalanceCode(e.code))) throw e;
          keep.push(p); // transient; retry next run
          err(kw.keyword, (e as Error).message);
          continue;
        }
        if (isNotReadyCode(task.status_code)) { keep.push(p); continue; }
        if (task.status_code !== 20000) { err(kw.keyword, `DataForSEO error ${task.status_code}: ${task.status_message}`); continue; }
        ranks.push({ keywordId: p.keywordId, date: p.date, ...parseSerpResult(task.result?.[0], kw.targetDomain) });
        touched.add(p.date);
      }
      if (ranks.length) await store.saveRanks(ranks);
      collected = ranks.length;
      pending = keep;
    }

    // 2. Post today's due keywords in batches of up to 100.
    const due = dueKeywords(keywords, await store.checkedKeywordIds(today), pending, today);
    for (const batch of chunk(due, BATCH_SIZE)) {
      let tasks: DfsTask[];
      try {
        tasks = await postSerpTasks(secret, batch.map(toSerpTask), f);
      } catch (e) {
        if (e instanceof DataForSeoError && isBalanceCode(e.code)) { fatal = BALANCE_MESSAGE; break; }
        throw e;
      }
      for (const [i, t] of tasks.entries()) {
        const tag = typeof t.data?.tag === "string" ? t.data.tag : batch[i]?.id;
        const kw = tag ? byId.get(tag) : undefined;
        if (t.status_code === 20100 && t.id && kw) {
          pending.push({ id: t.id, keywordId: kw.id, date: today, postedAt: now.toISOString() });
          posted++;
        } else if (isBalanceCode(t.status_code)) {
          fatal = BALANCE_MESSAGE;
        } else {
          err(kw?.keyword ?? String(t.data?.keyword ?? "?"), `DataForSEO error ${t.status_code}: ${t.status_message}`);
        }
      }
      if (fatal) break;
    }
  } finally {
    // 3. Summaries for every day that got new results; state is saved even on errors.
    for (const date of [...touched].sort()) await store.writeSummary(date, summaryMetrics(date, await store.ranksForDate(date), keywords.length));
    await store.saveState({ pendingTasks: pending, taskErrors: errors.slice(-MAX_TASK_ERRORS) });
  }
  return { collected, posted, pending: pending.length, errors, fatal };
}
