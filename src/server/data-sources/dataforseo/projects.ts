import "server-only";
import type { DataAsset, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { devicesFor, readRankSettings, type RankProjectSettings } from "@/lib/rankings";

// Rank projects: one DataAsset (kind RANK_PROJECT) per client on the agency's
// DATAFORSEO connection. externalId = target domain; settings = RankProjectSettings
// plus the sync's pendingTasks/taskErrors.

export function clientRankProject(clientId: string): Promise<DataAsset | null> {
  return prisma.dataAsset.findFirst({ where: { clientId, kind: "RANK_PROJECT" }, orderBy: { createdAt: "asc" } });
}

/** Distinct keyword texts currently tracked (active) in a project. */
export async function activeKeywordTexts(assetId: string): Promise<string[]> {
  const rows = await prisma.trackedKeyword.findMany({ where: { assetId, active: true }, select: { keyword: true }, distinct: ["keyword"], orderBy: { keyword: "asc" } });
  return rows.map((r) => r.keyword);
}

/**
 * Make the project's TrackedKeyword rows match `keywords` × the project's
 * devices at its location. Rows for other locations/devices are deactivated
 * (history kept, so switching back restores it); new combinations are created.
 */
export async function reconcileKeywordRows(asset: Pick<DataAsset, "id" | "clientId" | "externalId" | "settings">, keywords: string[]) {
  const s = readRankSettings(asset.settings);
  const devices = devicesFor(s.device);
  await prisma.$transaction([
    prisma.trackedKeyword.updateMany({ where: { assetId: asset.id }, data: { active: false, targetDomain: asset.externalId } }),
    prisma.trackedKeyword.updateMany({
      where: { assetId: asset.id, keyword: { in: keywords }, locationCode: s.locationCode, device: { in: devices } },
      data: { active: true, languageCode: s.languageCode },
    }),
    prisma.trackedKeyword.createMany({
      data: keywords.flatMap((keyword) => devices.map((device) => ({
        assetId: asset.id, clientId: asset.clientId, keyword, locationCode: s.locationCode, languageCode: s.languageCode, device, targetDomain: asset.externalId, active: true,
      }))),
      skipDuplicates: true,
    }),
  ]);
}

/** Settings JSON for a project, keeping the sync's bookkeeping fields. */
export function mergeRankSettings(current: unknown, next: RankProjectSettings): Prisma.InputJsonValue {
  const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  return { ...base, ...next } as Prisma.InputJsonValue;
}
