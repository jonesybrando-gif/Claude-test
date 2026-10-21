// Ad-level insights for the AI assistant's drill-down questions. Read-only.

import type { DetailRow } from "../types";
import { decimalToMinor } from "../common";
import { CALL_ACTION_TYPES, LEAD_ACTION_TYPES, PURCHASE_ACTION_TYPES, pickAction, type InsightRow } from "./adapter";

export interface AdInsightRow extends InsightRow {
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
}

export interface AdCreative {
  creative?: {
    title?: string;
    body?: string;
    object_story_spec?: { link_data?: { name?: string; message?: string; description?: string; link?: string }; video_data?: { title?: string; message?: string } };
  };
}

/** The headline and primary text of an ad's creative, wherever Meta keeps them. */
export function creativeText(c: AdCreative | undefined): { headline?: string; primary_text?: string; landing_page?: string } {
  const cr = c?.creative;
  const link = cr?.object_story_spec?.link_data;
  const video = cr?.object_story_spec?.video_data;
  return { headline: cr?.title ?? link?.name ?? video?.title, primary_text: cr?.body ?? link?.message ?? video?.message, landing_page: link?.link };
}

export function parseAdInsights(rows: AdInsightRow[], creatives: Record<string, AdCreative>): DetailRow[] {
  return rows.map((r) => {
    const leads = pickAction(r.actions, LEAD_ACTION_TYPES);
    const purchases = pickAction(r.actions, PURCHASE_ACTION_TYPES);
    const text = creativeText(r.ad_id ? creatives[r.ad_id] : undefined);
    const attributes = Object.fromEntries(Object.entries(text).filter((e): e is [string, string] => !!e[1]));
    return {
      label: r.ad_name ?? `Ad ${r.ad_id ?? ""}`.trim(),
      context: [r.campaign_name, r.adset_name].filter(Boolean).join(" › "),
      attributes,
      costMinor: decimalToMinor(r.spend),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      conversions: leads + purchases + pickAction(r.actions, CALL_ACTION_TYPES),
      conversionValueMinor: Math.round(pickAction(r.action_values, PURCHASE_ACTION_TYPES) * 100),
      leads,
    };
  });
}

/** Totals ads by their headline, so the same headline across ads counts once. */
export function headlinesFromAds(ads: DetailRow[]): DetailRow[] {
  const by = new Map<string, DetailRow & { n: number }>();
  for (const a of ads) {
    const h = a.attributes?.headline;
    if (!h) continue;
    const cur = by.get(h) ?? { label: h, context: "", attributes: { type: "headline" }, costMinor: 0, impressions: 0, clicks: 0, conversions: 0, conversionValueMinor: 0, leads: 0, n: 0 };
    cur.costMinor += a.costMinor;
    cur.impressions += a.impressions;
    cur.clicks += a.clicks;
    cur.conversions += a.conversions;
    cur.conversionValueMinor! += a.conversionValueMinor ?? 0;
    cur.leads! += a.leads ?? 0;
    cur.n += 1;
    cur.context = cur.n === 1 ? a.context : `${cur.n} ads`;
    by.set(h, cur);
  }
  return [...by.values()].map((row) => ({ label: row.label, context: row.context, attributes: row.attributes, costMinor: row.costMinor, impressions: row.impressions, clicks: row.clicks, conversions: row.conversions, conversionValueMinor: row.conversionValueMinor, leads: row.leads }));
}
