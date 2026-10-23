import { formatDate } from "@/lib/time";
import "server-only";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { ClientReport } from "../client-report";
import { getAdapter } from "../integrations/registry";
import { withAccessToken } from "../integrations/tokens";
import { IntegrationError } from "../integrations/errors";
import type { DetailKind, DetailRow } from "../integrations/types";
import { formatMoney, formatNumber, formatPct } from "@/lib/money";
import { PLATFORM_LABEL } from "@/lib/platforms";

// Read-only lookups the AI assistant can make while answering a question.
// Results are fetched live for the report's dates and never stored.

const KIND_LABEL: Record<DetailKind, string> = { ads: "ads", headlines: "ad headlines and descriptions", keywords: "keywords", search_terms: "search terms" };
const MAX_ROWS = 60;
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; rows: Promise<DetailRow[]> }>();

/** One account's detail rows, shared by repeated questions for ten minutes. */
function cachedDetail(key: string, load: () => Promise<DetailRow[]>): Promise<DetailRow[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const rows = load();
  cache.set(key, { at: Date.now(), rows });
  rows.catch(() => cache.delete(key));
  return rows;
}

/** Compact text table: most spend first, plus anything with results that would otherwise be cut. */
export function formatDetail(rows: DetailRow[], currency: string): string {
  const bySpend = [...rows].sort((a, b) => b.costMinor - a.costMinor);
  const shown = bySpend.slice(0, MAX_ROWS);
  const extra = bySpend.slice(MAX_ROWS).filter((r) => r.conversions > 0 || (r.leads ?? 0) > 0).slice(0, 20);
  const line = (r: DetailRow) => {
    const results = r.conversions > 0 ? r.conversions : r.leads ?? 0;
    const parts = [
      `spend ${formatMoney(r.costMinor, currency)}`,
      `impr ${formatNumber(r.impressions)}`,
      `clicks ${formatNumber(r.clicks)}`,
      `CTR ${r.impressions ? formatPct((r.clicks / r.impressions) * 100, 2) : "—"}`,
      `conv ${formatNumber(r.conversions, 1)}`,
      ...(r.leads ? [`leads ${formatNumber(r.leads)}`] : []),
      `cost/result ${results > 0 ? formatMoney(Math.round(r.costMinor / results), currency) : "none"}`,
      ...(r.conversionValueMinor ? [`value ${formatMoney(r.conversionValueMinor, currency)}`] : []),
    ];
    const attrs = Object.entries(r.attributes ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.length > 300 ? `${v.slice(0, 300)}…` : v}`);
    return `- "${r.label}" [${r.context}] ${parts.join("; ")}${attrs.length ? ` | ${attrs.join("; ")}` : ""}`;
  };
  const out = [...shown, ...extra].map(line);
  if (rows.length > out.length) out.push(`(${rows.length - out.length} more with less spend and no results not shown)`);
  return out.join("\n");
}

export function questionTools(rep: ClientReport) {
  const { client, range } = rep;
  const getDetail = betaZodTool({
    name: "get_detail",
    description: `Fetch live, read-only performance detail below campaign level for ${client.name} for the report period (${formatDate(range.from)} to ${formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}). Kinds: "ads" (each ad with its headlines/descriptions or primary text), "headlines" (each headline and description totalled across ads; Google may add its own rating), "keywords" (Google Ads only), "search_terms" (what people searched, Google Ads only). Returns rows sorted by spend with impressions, clicks, CTR, conversions, leads and cost per result.`,
    inputSchema: z.object({
      kind: z.enum(["ads", "headlines", "keywords", "search_terms"]),
      platform: z.enum(["GOOGLE_ADS", "META_ADS", "MICROSOFT_ADS"]).optional().describe("Limit to one platform; omit for all that support this kind"),
    }),
    run: async ({ kind, platform }) => {
      const accounts = client.accounts.filter((a) => (!platform || a.platform === platform) && a.status !== "DISCONNECTED");
      if (!accounts.length) return `No ${platform ? PLATFORM_LABEL[platform] : ""} accounts are linked to this client.`;
      const sections: string[] = [];
      for (const a of accounts) {
        const name = `${PLATFORM_LABEL[a.platform]} · ${a.name}`;
        if (a.isDemo) {
          sections.push(`${name}: demo account; no ad-level data exists.`);
          continue;
        }
        const adapter = getAdapter(a.platform);
        if (!adapter.fetchDetail || !adapter.detailKinds?.includes(kind)) {
          if (platform || a.platform !== "GOOGLE_LSA") sections.push(`${name}: ${KIND_LABEL[kind]} aren't available for this platform.`);
          continue;
        }
        if (!a.connectionId) {
          sections.push(`${name}: not connected, so live detail can't be fetched.`);
          continue;
        }
        const ref = { externalId: a.externalId, loginCustomerId: a.loginCustomerId, timezone: a.timezone ?? client.timezone };
        try {
          const rows = await cachedDetail(`${a.id}|${kind}|${range.from}|${range.to}`, () =>
            withAccessToken(a.connectionId!, adapter, (token) => adapter.fetchDetail!(token, ref, kind, range.from, range.to)),
          );
          sections.push(rows.length ? `${name}, ${KIND_LABEL[kind]} (${rows.length}):\n${formatDetail(rows, a.currency)}` : `${name}: no ${KIND_LABEL[kind]} with impressions in this period.`);
        } catch (e) {
          sections.push(`${name}: couldn't fetch ${KIND_LABEL[kind]} (${e instanceof IntegrationError ? e.message : "unexpected error"}).`);
        }
      }
      return sections.join("\n\n");
    },
  });
  return [getDetail];
}
