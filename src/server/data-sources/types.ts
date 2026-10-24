import type { DataAsset, DataAssetKind, DataSourceConnection, DataSourceProvider } from "@prisma/client";
import type { IsoDate } from "@/lib/pacing/dates";

/** One daily value to store in MetricDaily. dimension/dimensionValue "" = total. */
export interface MetricRow {
  date: IsoDate;
  metric: string; // must exist in src/lib/metrics-registry
  value: number;
  dimension?: string;
  dimensionValue?: string;
}

/** An asset the connection can see (for the "link to client" picker). */
export interface RemoteAsset {
  kind: DataAssetKind;
  externalId: string;
  name: string;
  timezone?: string;
  settings?: Record<string, unknown>;
  /** Parent grouping shown in the picker, e.g. GA4 account name or Business Profile account. */
  group?: string;
}

export interface SyncContext {
  connection: DataSourceConnection;
  asset: DataAsset;
  /** Valid access token (OAuth providers) — refreshed by the runner. */
  accessToken?: string;
  /** Decrypted API key/secret (key-based providers). */
  secret?: string;
  from: IsoDate;
  to: IsoDate;
}

/** Implemented once per provider in src/server/data-sources/<provider>/adapter.ts. */
export interface DataSourceAdapter {
  provider: DataSourceProvider;
  /** Asset kinds this provider syncs. */
  kinds: DataAssetKind[];
  /** OAuth providers: refresh an access token from the stored refresh token. */
  refreshAccessToken?(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date; refreshToken?: string }>;
  listAssets(ctx: { connection: DataSourceConnection; accessToken?: string; secret?: string }): Promise<RemoteAsset[]>;
  /** Fetch [from, to] for one asset. Return every row for the window; the runner replaces stored rows for those dates. */
  fetchMetrics(ctx: SyncContext): Promise<MetricRow[]>;
  /** Days re-fetched on every sync to pick up restated data (e.g. GSC lags ~3 days). Default 3. */
  refetchDays?: number;
  /** Days of history imported on first sync. Default 395 (13 months). */
  backfillDays?: number;
  /** Per-asset window override (e.g. one adapter serving several products with different lags). */
  windowFor?(asset: DataAsset): { refetchDays?: number; backfillDays?: number };
  /** Override for assets with their own sync path (e.g. rank tracking writes KeywordRank). */
  syncAsset?(ctx: SyncContext): Promise<{ rows: number }>;
}
