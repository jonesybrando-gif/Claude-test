import { addDays, maxDate } from "@/lib/pacing/dates";
import type { DataSourceAdapter, RemoteAsset } from "../types";
import type { GoogleKindModule } from "./types";
import { GOOGLE_MODULES } from "./modules";
import { refreshGoogleToken, type GoogleOAuthClient } from "./oauth";
import type { FetchLike } from "./http";

// GOOGLE data-source adapter: one login, several products. Dispatches by
// asset kind to the modules in ./modules.ts (GA4, Search Console, Business Profile).

const KIND_LABEL: Record<string, string> = { GA4_PROPERTY: "Google Analytics", GSC_SITE: "Search Console", GBP_LOCATION: "Business Profile" };

export interface ListAssetsResult { assets: RemoteAsset[]; warnings: string[] }

/**
 * Optional extension any adapter may implement: like listAssets, but reports
 * partial failures (e.g. one Google API not enabled) instead of hiding them.
 * The shared asset picker uses it when present.
 */
export interface ListAssetsWithWarnings {
  listAssetsWithWarnings(ctx: Parameters<DataSourceAdapter["listAssets"]>[0]): Promise<ListAssetsResult>;
}

export type GoogleDataSourceAdapter = DataSourceAdapter & ListAssetsWithWarnings;

export function createGoogleAdapter(opts: { modules?: GoogleKindModule[]; client?: GoogleOAuthClient; fetch?: FetchLike } = {}): GoogleDataSourceAdapter {
  const modules = opts.modules ?? GOOGLE_MODULES;
  const byKind = new Map(modules.map((m) => [m.kind, m]));
  const refetchDays = Math.max(3, ...modules.map((m) => m.refetchDays ?? 3));
  const backfillDays = Math.max(...modules.map((m) => m.backfillDays ?? 395));

  async function listAssetsWithWarnings(ctx: Parameters<DataSourceAdapter["listAssets"]>[0]): Promise<ListAssetsResult> {
    const token = ctx.accessToken;
    if (!token) throw new Error("Google API 401: not signed in to Google");
    const results = await Promise.allSettled(modules.map((m) => m.listAssets(token)));
    const assets: RemoteAsset[] = [];
    const warnings: string[] = [];
    const failures: unknown[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") assets.push(...r.value);
      else {
        failures.push(r.reason);
        warnings.push(`${KIND_LABEL[modules[i].kind] ?? modules[i].kind}: ${(r.reason as Error)?.message ?? String(r.reason)}`);
      }
    });
    // Every product failed: surface the error (e.g. revoked login) rather than an empty list.
    if (failures.length === modules.length && modules.length > 0) throw failures[0];
    return { assets, warnings };
  }

  return {
    provider: "GOOGLE",
    kinds: modules.map((m) => m.kind),
    refetchDays,
    backfillDays,

    async refreshAccessToken(refreshToken) {
      const t = await refreshGoogleToken(refreshToken, { client: opts.client, fetch: opts.fetch });
      return { accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken };
    },

    listAssetsWithWarnings,
    async listAssets(ctx) {
      return (await listAssetsWithWarnings(ctx)).assets;
    },

    async fetchMetrics(ctx) {
      const m = byKind.get(ctx.asset.kind);
      if (!m) throw new Error(`The Google data source does not handle ${ctx.asset.kind} assets.`);
      // The runner backfills the longest module window; respect this module's own limit.
      const from = m.backfillDays ? maxDate(ctx.from, addDays(ctx.to, -m.backfillDays)) : ctx.from;
      if (from > ctx.to) return [];
      return m.fetchMetrics({ ...ctx, from });
    },
  };
}

export const googleAdapter = createGoogleAdapter();
