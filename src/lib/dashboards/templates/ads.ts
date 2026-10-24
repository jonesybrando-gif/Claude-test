import type { DashboardTemplateDef } from "./index";

/** Paid media at a glance: headline ad KPIs, a trend, spend share, pacing and campaigns. */
export const adsOverviewTemplate: DashboardTemplateDef = {
  key: "ads-overview",
  name: "Ads overview",
  description: "Headline ad KPIs, daily trend, spend by account, budget pacing and the campaign table.",
  sources: ["ads"],
  widgets: [
    { id: "ads-spend", kind: "kpi", metrics: ["ads.spend"], x: 0, y: 0, w: 2, h: 2 },
    { id: "ads-clicks", kind: "kpi", metrics: ["ads.clicks"], x: 2, y: 0, w: 2, h: 2 },
    { id: "ads-ctr", kind: "kpi", metrics: ["ads.ctr"], x: 4, y: 0, w: 2, h: 2 },
    { id: "ads-conv", kind: "kpi", metrics: ["ads.conversions"], x: 6, y: 0, w: 2, h: 2 },
    { id: "ads-cpa", kind: "kpi", metrics: ["ads.costPerConversion"], x: 8, y: 0, w: 2, h: 2 },
    { id: "ads-leads", kind: "kpi", metrics: ["ads.leads"], x: 10, y: 0, w: 2, h: 2 },
    { id: "ads-trend", kind: "line", title: "Daily performance", metrics: ["ads.spend", "ads.conversions", "ads.clicks"], x: 0, y: 2, w: 8, h: 4 },
    { id: "ads-share", kind: "pie", title: "Spend by ad account", metrics: ["ads.spend"], dimension: "platform", x: 8, y: 2, w: 4, h: 4 },
    { id: "ads-pacing", kind: "pacing", title: "Budget pacing", x: 0, y: 6, w: 12, h: 6 },
    { id: "ads-campaigns", kind: "campaigns", title: "Campaigns", x: 0, y: 12, w: 12, h: 7 },
  ],
};
