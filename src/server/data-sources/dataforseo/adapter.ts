import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { isoToDate } from "@/lib/pacing/dates";
import { readRankSettings } from "@/lib/rankings";
import type { DataSourceAdapter, SyncContext } from "../types";
import { runRankSync, type RankKeyword, type RankStore } from "./core";

// DataForSEO rank tracking. Assets (RANK_PROJECT) are created on the client's
// Rankings page, not through the shared picker, so listAssets is empty and the
// runner calls syncAsset instead of fetchMetrics.

function prismaStore(assetId: string, clientId: string): RankStore {
  return {
    async activeKeywords() {
      const rows = await prisma.trackedKeyword.findMany({
        where: { assetId, active: true },
        select: { id: true, keyword: true, locationCode: true, languageCode: true, device: true, targetDomain: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r): RankKeyword => ({ ...r, device: r.device === "mobile" ? "mobile" : "desktop" }));
    },
    async checkedKeywordIds(date) {
      const rows = await prisma.keywordRank.findMany({ where: { date: isoToDate(date), keyword: { assetId } }, select: { keywordId: true } });
      return new Set(rows.map((r) => r.keywordId));
    },
    async saveRanks(ranks) {
      for (const r of ranks) {
        const data = { position: r.position, url: r.url?.slice(0, 2000) ?? null, serpFeatures: r.serpFeatures, checkedAt: new Date() };
        await prisma.keywordRank.upsert({
          where: { keywordId_date: { keywordId: r.keywordId, date: isoToDate(r.date) } },
          create: { keywordId: r.keywordId, date: isoToDate(r.date), ...data },
          update: data,
        });
      }
    },
    async ranksForDate(date) {
      return prisma.keywordRank.findMany({ where: { date: isoToDate(date), keyword: { assetId, active: true } }, select: { keywordId: true, position: true } });
    },
    async writeSummary(date, rows) {
      // Lazy import: ../sync imports the registry, which imports this file.
      const { writeMetricRows } = await import("../sync");
      await writeMetricRows(assetId, clientId, date, date, rows);
    },
    async saveState({ pendingTasks, taskErrors }) {
      // Re-read so settings saved from the Rankings page meanwhile are kept.
      const cur = await prisma.dataAsset.findUnique({ where: { id: assetId }, select: { settings: true } });
      const base = cur?.settings && typeof cur.settings === "object" && !Array.isArray(cur.settings) ? (cur.settings as Prisma.JsonObject) : {};
      await prisma.dataAsset.update({
        where: { id: assetId },
        data: { settings: { ...base, pendingTasks, taskErrors, lastRunAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue },
      });
    },
  };
}

export async function syncRankProject(ctx: SyncContext): Promise<{ rows: number }> {
  if (!ctx.secret) throw new Error("DataForSEO is not connected (no API login stored).");
  const settings = readRankSettings(ctx.asset.settings);
  const out = await runRankSync({ secret: ctx.secret, today: ctx.to, pendingTasks: settings.pendingTasks, store: prismaStore(ctx.asset.id, ctx.asset.clientId) });
  // The runner records thrown errors in DataAsset.lastError.
  if (out.fatal) throw new Error(out.fatal);
  return { rows: out.collected };
}

export const dataForSeoAdapter: DataSourceAdapter = {
  provider: "DATAFORSEO",
  kinds: ["RANK_PROJECT"],
  async listAssets() {
    return [];
  },
  async fetchMetrics() {
    return []; // unused: syncAsset handles rank projects
  },
  refetchDays: 0,
  backfillDays: 0,
  syncAsset: syncRankProject,
};
