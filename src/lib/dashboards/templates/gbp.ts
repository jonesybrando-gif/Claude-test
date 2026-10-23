// "Google Business Profile" dashboard template.
import type { DashboardTemplateDef } from "./index";

export const gbpTemplate: DashboardTemplateDef = {
  key: "gbp",
  name: "Google Business Profile",
  description: "Profile views, calls, website clicks, directions, reviews and the search terms people used to find the business.",
  sources: ["gbp"],
  widgets: [
    { id: "gbp-views", kind: "kpi", title: "Profile views", metrics: ["gbp.views"], x: 0, y: 0, w: 2, h: 2 },
    { id: "gbp-calls", kind: "kpi", title: "Calls", metrics: ["gbp.calls"], x: 2, y: 0, w: 2, h: 2 },
    { id: "gbp-website", kind: "kpi", title: "Website clicks", metrics: ["gbp.websiteClicks"], x: 4, y: 0, w: 2, h: 2 },
    { id: "gbp-directions", kind: "kpi", title: "Directions", metrics: ["gbp.directions"], x: 6, y: 0, w: 2, h: 2 },
    { id: "gbp-rating", kind: "kpi", title: "Average rating", metrics: ["gbp.averageRating"], x: 8, y: 0, w: 2, h: 2 },
    { id: "gbp-reviews", kind: "kpi", title: "Total reviews", metrics: ["gbp.reviewCount"], x: 10, y: 0, w: 2, h: 2 },
    { id: "gbp-views-line", kind: "line", title: "Profile views", metrics: ["gbp.views", "gbp.searchViews", "gbp.mapsViews"], x: 0, y: 2, w: 12, h: 4 },
    { id: "gbp-actions-bar", kind: "bar", title: "Actions by type", metrics: ["gbp.calls", "gbp.websiteClicks", "gbp.directions"], x: 0, y: 6, w: 6, h: 5 },
    { id: "gbp-keywords", kind: "table", title: "Search keywords", metrics: ["gbp.keywordImpressions"], dimension: "keyword", x: 6, y: 6, w: 6, h: 5 },
  ],
};
