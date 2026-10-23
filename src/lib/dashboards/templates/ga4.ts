import type { DashboardTemplateDef } from "./index";

/** Website traffic overview from Google Analytics 4. */
export const ga4Template: DashboardTemplateDef = {
  key: "ga4-overview",
  name: "Website traffic (GA4)",
  description: "Sessions, users, engagement and key events, with channels, top landing pages and devices.",
  sources: ["ga4"],
  widgets: [
    { id: "ga4-kpi-sessions", kind: "kpi", title: "Sessions", metrics: ["ga4.sessions"], x: 0, y: 0, w: 3, h: 2 },
    { id: "ga4-kpi-users", kind: "kpi", title: "Users", metrics: ["ga4.totalUsers"], x: 3, y: 0, w: 3, h: 2 },
    { id: "ga4-kpi-engagement", kind: "kpi", title: "Engagement rate", metrics: ["ga4.engagementRate"], x: 6, y: 0, w: 3, h: 2 },
    { id: "ga4-kpi-key-events", kind: "kpi", title: "Key events", metrics: ["ga4.keyEvents"], x: 9, y: 0, w: 3, h: 2 },
    { id: "ga4-line-traffic", kind: "line", title: "Sessions and users", metrics: ["ga4.sessions", "ga4.totalUsers"], x: 0, y: 2, w: 12, h: 4 },
    { id: "ga4-table-channels", kind: "table", title: "Channels", dimension: "channel", metrics: ["ga4.sessions", "ga4.totalUsers", "ga4.engagementRate", "ga4.keyEvents"], x: 0, y: 6, w: 7, h: 5 },
    { id: "ga4-pie-devices", kind: "pie", title: "Devices", dimension: "device", metrics: ["ga4.sessions"], x: 7, y: 6, w: 5, h: 5 },
    { id: "ga4-table-pages", kind: "table", title: "Top landing pages", dimension: "page", metrics: ["ga4.sessions", "ga4.engagementRate", "ga4.averageSessionDuration", "ga4.keyEvents"], x: 0, y: 11, w: 12, h: 6 },
  ],
};
