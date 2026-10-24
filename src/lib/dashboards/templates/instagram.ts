// Instagram organic dashboard template.
import type { DashboardTemplateDef } from "./index";

export const instagramTemplate: DashboardTemplateDef = {
  key: "instagram-organic",
  name: "Instagram",
  description: "Followers, reach, interactions and profile visits, with daily reach and the top posts.",
  sources: ["instagram"],
  widgets: [
    { id: "ig-followers", kind: "kpi", title: "Followers", metrics: ["instagram.followers"], x: 0, y: 0, w: 3, h: 2 },
    { id: "ig-reach", kind: "kpi", title: "Reach", metrics: ["instagram.reach"], x: 3, y: 0, w: 3, h: 2 },
    { id: "ig-interactions", kind: "kpi", title: "Interactions", metrics: ["instagram.interactions"], x: 6, y: 0, w: 3, h: 2 },
    { id: "ig-profile-views", kind: "kpi", title: "Profile visits", metrics: ["instagram.profileViews"], x: 9, y: 0, w: 3, h: 2 },
    { id: "ig-reach-line", kind: "line", title: "Daily reach", metrics: ["instagram.reach", "instagram.views"], x: 0, y: 2, w: 12, h: 4 },
    { id: "ig-top-posts", kind: "table", title: "Top posts", metrics: ["instagram.postEngagements", "instagram.postReach"], dimension: "post", x: 0, y: 6, w: 12, h: 5 },
  ],
};
