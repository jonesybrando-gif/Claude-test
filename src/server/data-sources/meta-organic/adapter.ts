import "server-only";
import type { DataSourceAdapter, RemoteAsset, SyncContext } from "../types";
import { createGraphClient, type FetchLike } from "./graph";
import { fetchFacebookPage } from "./facebook";
import { fetchInstagramAccount } from "./instagram";
import { metaOrganicConfig, type MetaOrganicConfig } from "./oauth";

// META_ORGANIC: Facebook Pages (FB_PAGE) and Instagram professional accounts
// (IG_ACCOUNT) reachable by one Facebook login. The connection stores only the
// long-lived user token; Page tokens are fetched from it on every sync.

interface PageNode {
  id: string;
  name?: string;
  instagram_business_account?: { id: string; username?: string };
}

export interface MetaOrganicAdapterOptions {
  config?: MetaOrganicConfig | null;
  fetch?: FetchLike;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export function createMetaOrganicAdapter(opts: MetaOrganicAdapterOptions = {}): DataSourceAdapter {
  const cfg = () => {
    const c = opts.config === undefined ? metaOrganicConfig() : opts.config;
    if (!c) throw new Error("Meta app credentials (META_APP_ID, META_APP_SECRET) are not configured on the server.");
    return c;
  };
  const client = createGraphClient({ config: cfg, fetch: opts.fetch, sleep: opts.sleep });
  const now = () => (opts.now ? opts.now() : new Date());
  const requireToken = (t: string | undefined) => {
    if (!t) throw new Error("Facebook authorization expired or is missing. Reconnect Facebook & Instagram.");
    return t;
  };

  return {
    provider: "META_ORGANIC",
    kinds: ["FB_PAGE", "IG_ACCOUNT"],
    // Page insights restate for a few days and post engagement keeps growing for about a week.
    refetchDays: 7,
    // Both Page and Instagram insights keep about two years of history.
    backfillDays: 720,

    async listAssets({ accessToken }): Promise<RemoteAsset[]> {
      const token = requireToken(accessToken);
      // access_token is read only to skip Pages this login cannot act on; it is never stored (re-fetched at sync time).
      const pages = await client.getAll<PageNode & { access_token?: string }>("me/accounts", token, {
        fields: "id,name,access_token,instagram_business_account{id,username}",
        limit: "100",
      });
      const out: RemoteAsset[] = [];
      for (const p of pages) {
        if (!p.access_token) continue;
        const name = p.name ?? `Page ${p.id}`;
        out.push({ kind: "FB_PAGE", externalId: p.id, name, group: "Facebook Pages" });
        const ig = p.instagram_business_account;
        if (ig?.id) out.push({ kind: "IG_ACCOUNT", externalId: ig.id, name: ig.username ? `@${ig.username}` : `Instagram ${ig.id}`, group: name, settings: { pageId: p.id } });
      }
      return out;
    },

    async fetchMetrics(ctx: SyncContext) {
      const token = requireToken(ctx.accessToken);
      const outcome = ctx.asset.kind === "FB_PAGE" ? await fetchFacebookPage(client, ctx, token, now()) : ctx.asset.kind === "IG_ACCOUNT" ? await fetchInstagramAccount(client, ctx, token, now()) : null;
      if (!outcome) throw new Error(`Unsupported asset kind ${ctx.asset.kind} for Facebook & Instagram`);
      // Non-fatal notes (deprecated metrics, posts unavailable). Messages never contain tokens.
      if (outcome.warnings.length) console.warn(`[meta-organic] ${ctx.asset.kind} ${ctx.asset.id}: ${outcome.warnings.join(" | ")}`);
      return outcome.rows;
    },
  };
}

export const metaOrganicAdapter = createMetaOrganicAdapter();
