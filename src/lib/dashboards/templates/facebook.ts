// Facebook Page organic dashboard template.
import type { DashboardTemplateDef } from "./index";

export const facebookTemplate: DashboardTemplateDef = {
  key: "facebook-organic",
  name: "Facebook Page",
  description: "Followers, reach, engagement and Page views, with daily reach and the top posts.",
  sources: ["facebook"],
  widgets: [
    { id: "fb-followers", kind: "kpi", title: "Followers", metrics: ["facebook.followers"], x: 0, y: 0, w: 3, h: 2 },
    { id: "fb-reach", kind: "kpi", title: "Reach", metrics: ["facebook.reach"], x: 3, y: 0, w: 3, h: 2 },
    { id: "fb-engagements", kind: "kpi", title: "Engagements", metrics: ["facebook.engagements"], x: 6, y: 0, w: 3, h: 2 },
    { id: "fb-page-views", kind: "kpi", title: "Page views", metrics: ["facebook.pageViews"], x: 9, y: 0, w: 3, h: 2 },
    { id: "fb-reach-line", kind: "line", title: "Daily reach", metrics: ["facebook.reach", "facebook.views"], x: 0, y: 2, w: 12, h: 4 },
    { id: "fb-top-posts", kind: "table", title: "Top posts", metrics: ["facebook.postEngagements"], dimension: "post", x: 0, y: 6, w: 12, h: 5 },
  ],
};
