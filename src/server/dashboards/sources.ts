import "server-only";
import type { DataAssetKind } from "@prisma/client";
import { prisma } from "../db";
import type { MetricSource } from "@/lib/metrics-registry";
import type { IsoDate } from "@/lib/pacing/dates";
import type { KeywordRankRow } from "@/lib/dashboards/widget-data";

// Data a dashboard needs from sources that live outside the metric registry's
// query API. Kept behind small functions so the resolver (./data.ts) can be
// tested with mocks and so other branches can be wired in at merge time.

export interface KeywordRankOptions {
  from: IsoDate;
  to: IsoDate;
  /** Comparison period end (for "previous" positions); omitted when there is no comparison. */
  compareTo?: IsoDate;
  limit?: number;
}

export type KeywordRankTableFn = (clientId: string, opts: KeywordRankOptions) => Promise<KeywordRankRow[]>;

/**
 * Tracked keyword positions for the rankings widget.
 * TODO(rankings merge): delegate to `keywordRankTable(clientId, opts)` from
 * src/server/metrics/rankings.ts (DataForSEO branch) and map its rows to
 * KeywordRankRow. Until then no rankings are available.
 */
export const keywordRankTable: KeywordRankTableFn = async () => [];

const KIND_SOURCES: Record<DataAssetKind, MetricSource[]> = {
  GA4_PROPERTY: ["ga4"],
  GSC_SITE: ["gsc"],
  GBP_LOCATION: ["gbp"],
  FB_PAGE: ["facebook"],
  IG_ACCOUNT: ["instagram"],
  CALLRAIL_COMPANY: ["callrail"],
  RANK_PROJECT: ["rank"],
};

/** Sources with something linked to the client ("ads" = any ad account). Drives "Connect GA4 to see this". */
export async function linkedSources(clientId: string): Promise<MetricSource[]> {
  const [assets, ads] = await Promise.all([
    prisma.dataAsset.findMany({ where: { clientId }, select: { kind: true }, distinct: ["kind"] }),
    prisma.adAccount.count({ where: { clientId } }),
  ]);
  const out = new Set<MetricSource>(assets.flatMap((a) => KIND_SOURCES[a.kind] ?? []));
  if (ads > 0) out.add("ads");
  return [...out];
}
