// "Keyword rankings" dashboard template (DataForSEO rank tracking).
import type { DashboardTemplateDef } from "./index";

export const rankingsTemplate: DashboardTemplateDef = {
  key: "rankings",
  name: "Keyword rankings",
  description: "Exact daily Google positions for tracked keywords: average position, keywords in the top 3 and top 10, trend, and a full rankings table.",
  sources: ["rank"],
  widgets: [
    { id: "rank-avg", kind: "kpi", title: "Average position", metrics: ["rank.avgPosition"], x: 0, y: 0, w: 3, h: 2 },
    { id: "rank-top3", kind: "kpi", title: "Top 3", metrics: ["rank.top3"], x: 3, y: 0, w: 3, h: 2 },
    { id: "rank-top10", kind: "kpi", title: "Top 10", metrics: ["rank.top10"], x: 6, y: 0, w: 3, h: 2 },
    { id: "rank-tracked", kind: "kpi", title: "Keywords tracked", metrics: ["rank.tracked"], x: 9, y: 0, w: 3, h: 2 },
    { id: "rank-trend", kind: "line", title: "Average position", metrics: ["rank.avgPosition"], x: 0, y: 2, w: 12, h: 4 },
    { id: "rank-table", kind: "rankings", title: "Keyword rankings", x: 0, y: 6, w: 12, h: 8 },
  ],
};
