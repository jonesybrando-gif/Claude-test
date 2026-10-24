// "SEO (Search Console)" dashboard template.
import type { DashboardTemplateDef } from "./index";

const TABLE_METRICS = ["gsc.clicks", "gsc.impressions", "gsc.ctr", "gsc.position"];

export const seoTemplate: DashboardTemplateDef = {
  key: "seo",
  name: "SEO (Search Console)",
  description: "Organic search performance from Google Search Console: clicks, impressions, CTR, average position, top queries and pages, and device split.",
  sources: ["gsc"],
  widgets: [
    { id: "seo-clicks", kind: "kpi", title: "Clicks", metrics: ["gsc.clicks"], x: 0, y: 0, w: 3, h: 2 },
    { id: "seo-impressions", kind: "kpi", title: "Impressions", metrics: ["gsc.impressions"], x: 3, y: 0, w: 3, h: 2 },
    { id: "seo-ctr", kind: "kpi", title: "CTR", metrics: ["gsc.ctr"], x: 6, y: 0, w: 3, h: 2 },
    { id: "seo-position", kind: "kpi", title: "Average position", metrics: ["gsc.position"], x: 9, y: 0, w: 3, h: 2 },
    { id: "seo-trend", kind: "line", title: "Clicks and impressions", metrics: ["gsc.clicks", "gsc.impressions"], x: 0, y: 2, w: 12, h: 4 },
    { id: "seo-queries", kind: "table", title: "Top queries", metrics: TABLE_METRICS, dimension: "query", x: 0, y: 6, w: 12, h: 6 },
    { id: "seo-pages", kind: "table", title: "Top pages", metrics: TABLE_METRICS, dimension: "page", x: 0, y: 12, w: 8, h: 6 },
    { id: "seo-devices", kind: "pie", title: "Clicks by device", metrics: ["gsc.clicks"], dimension: "device", x: 8, y: 12, w: 4, h: 6 },
  ],
};
