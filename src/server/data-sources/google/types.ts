import type { DataAssetKind } from "@prisma/client";
import type { MetricRow, RemoteAsset, SyncContext } from "../types";

/**
 * One Google product behind the single GOOGLE login (GA4, Search Console,
 * Business Profile). The GOOGLE adapter (./adapter.ts) dispatches by asset kind
 * to these modules: ./ga4.ts, ./gsc.ts, ./gbp.ts.
 */
export interface GoogleKindModule {
  kind: DataAssetKind;
  /** OAuth scopes this product needs (merged into the Google login request). */
  scopes: string[];
  listAssets(accessToken: string): Promise<RemoteAsset[]>;
  /** ctx.accessToken is always set for Google. */
  fetchMetrics(ctx: SyncContext): Promise<MetricRow[]>;
  refetchDays?: number;
  backfillDays?: number;
}
