// GAQL for the AI assistant's drill-down questions: ads, ad text assets,
// keywords and search terms, totalled over a date range. Read-only.

import type { IsoDate } from "@/lib/pacing/dates";
import type { DetailKind, DetailRow } from "../types";
import { microsToMinor } from "./gaql";

const LIMIT = 200;
const notLsa = "campaign.advertising_channel_type != 'LOCAL_SERVICES'";
const range = (from: IsoDate, to: IsoDate) => `segments.date BETWEEN '${from}' AND '${to}'`;
const METRICS = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";

export function detailQuery(kind: DetailKind, from: IsoDate, to: IsoDate, withPerformanceLabel = true): string {
  switch (kind) {
    case "ads":
      return `SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.status,
  ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls, ${METRICS}
FROM ad_group_ad WHERE ${range(from, to)} AND ${notLsa} AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT ${LIMIT}`;
    case "headlines":
      return `SELECT campaign.name, ad_group.name, asset.text_asset.text, ad_group_ad_asset_view.field_type${withPerformanceLabel ? ", ad_group_ad_asset_view.performance_label" : ""}, ${METRICS}
FROM ad_group_ad_asset_view WHERE ${range(from, to)} AND ${notLsa} AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION') AND metrics.impressions > 0`;
    case "keywords":
      return `SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ${METRICS}
FROM keyword_view WHERE ${range(from, to)} AND ${notLsa} AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT ${LIMIT}`;
    case "search_terms":
      return `SELECT campaign.name, ad_group.name, search_term_view.search_term, search_term_view.status, ${METRICS}
FROM search_term_view WHERE ${range(from, to)} AND ${notLsa} AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT ${LIMIT}`;
  }
}

interface Metrics {
  impressions?: string | number;
  clicks?: string | number;
  costMicros?: string | number;
  conversions?: number | string;
  conversionsValue?: number | string;
}

export interface DetailApiRow {
  campaign?: { name?: string };
  adGroup?: { name?: string };
  adGroupAd?: {
    status?: string;
    ad?: { id?: string; name?: string; type?: string; finalUrls?: string[]; responsiveSearchAd?: { headlines?: { text?: string }[]; descriptions?: { text?: string }[] } };
  };
  asset?: { textAsset?: { text?: string } };
  adGroupAdAssetView?: { fieldType?: string; performanceLabel?: string };
  adGroupCriterion?: { status?: string; keyword?: { text?: string; matchType?: string } };
  searchTermView?: { searchTerm?: string; status?: string };
  metrics?: Metrics;
}

const n = (v: string | number | undefined) => Number(v ?? 0) || 0;
const metrics = (m: Metrics | undefined) => ({
  costMinor: microsToMinor(m?.costMicros),
  impressions: n(m?.impressions),
  clicks: n(m?.clicks),
  conversions: n(m?.conversions),
  conversionValueMinor: Math.round(n(m?.conversionsValue) * 100),
});
const where = (r: DetailApiRow) => [r.campaign?.name, r.adGroup?.name].filter(Boolean).join(" › ");
const lower = (s: string | undefined) => (s ? s.toLowerCase().replace(/_/g, " ") : "");

export function parseDetailRows(kind: DetailKind, rows: DetailApiRow[]): DetailRow[] {
  const attrs = (o: Record<string, string | undefined>): Record<string, string> => Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => !!e[1]));
  if (kind === "headlines") {
    // The same headline often runs in many ads: total it, and keep where it runs.
    const byText = new Map<string, DetailRow & { places: Set<string>; labels: Set<string> }>();
    for (const r of rows) {
      const text = r.asset?.textAsset?.text;
      if (!text) continue;
      const type = lower(r.adGroupAdAssetView?.fieldType) || "text";
      const key = `${type}|${text}`;
      const m = metrics(r.metrics);
      const cur = byText.get(key) ?? { label: text, context: "", attributes: { type }, costMinor: 0, impressions: 0, clicks: 0, conversions: 0, conversionValueMinor: 0, places: new Set<string>(), labels: new Set<string>() };
      cur.costMinor += m.costMinor;
      cur.impressions += m.impressions;
      cur.clicks += m.clicks;
      cur.conversions += m.conversions;
      cur.conversionValueMinor! += m.conversionValueMinor;
      cur.places.add(where(r));
      const pl = r.adGroupAdAssetView?.performanceLabel;
      if (pl && !["UNSPECIFIED", "UNKNOWN", "PENDING", "LEARNING"].includes(pl)) cur.labels.add(lower(pl));
      byText.set(key, cur);
    }
    return [...byText.values()].map(({ places, labels, ...row }) => ({
      ...row,
      context: places.size === 1 ? [...places][0] : `${places.size} ad groups`,
      attributes: { ...row.attributes, ...(labels.size ? { google_rating: [...labels].join("/") } : {}) },
    }));
  }
  return rows.map((r) => {
    const m = metrics(r.metrics);
    if (kind === "ads") {
      const ad = r.adGroupAd?.ad;
      const headlines = (ad?.responsiveSearchAd?.headlines ?? []).map((h) => h.text).filter(Boolean);
      const descriptions = (ad?.responsiveSearchAd?.descriptions ?? []).map((d) => d.text).filter(Boolean);
      return {
        label: ad?.name || headlines.slice(0, 3).join(" | ") || `${lower(ad?.type) || "ad"} ${ad?.id ?? ""}`.trim(),
        context: where(r),
        attributes: attrs({
          type: lower(ad?.type),
          status: lower(r.adGroupAd?.status),
          headlines: headlines.join(" | "),
          descriptions: descriptions.join(" | "),
          landing_page: ad?.finalUrls?.[0],
        }),
        ...m,
      };
    }
    if (kind === "keywords") {
      return { label: r.adGroupCriterion?.keyword?.text ?? "(keyword)", context: where(r), attributes: attrs({ match_type: lower(r.adGroupCriterion?.keyword?.matchType), status: lower(r.adGroupCriterion?.status) }), ...m };
    }
    return { label: r.searchTermView?.searchTerm ?? "(search term)", context: where(r), attributes: attrs({ status: lower(r.searchTermView?.status) }), ...m };
  });
}
