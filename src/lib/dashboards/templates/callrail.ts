import type { DashboardTemplateDef } from "./index";

export const callrailTemplate: DashboardTemplateDef = {
  key: "callrail-calls",
  name: "Calls (CallRail)",
  description: "Call volume, answer rate, first-time callers, call length and leads, with calls by source and campaign.",
  sources: ["callrail"],
  widgets: [
    { id: "cr-calls", kind: "kpi", metrics: ["callrail.calls"], x: 0, y: 0, w: 3, h: 2 },
    { id: "cr-answer-rate", kind: "kpi", metrics: ["callrail.answerRate"], x: 3, y: 0, w: 3, h: 2 },
    { id: "cr-first-time", kind: "kpi", metrics: ["callrail.firstTimeCallers"], x: 6, y: 0, w: 2, h: 2 },
    { id: "cr-avg-duration", kind: "kpi", metrics: ["callrail.avgDuration"], x: 8, y: 0, w: 2, h: 2 },
    { id: "cr-leads", kind: "kpi", metrics: ["callrail.leads"], x: 10, y: 0, w: 2, h: 2 },
    { id: "cr-calls-line", kind: "line", title: "Calls", metrics: ["callrail.calls", "callrail.answered"], x: 0, y: 2, w: 12, h: 4 },
    { id: "cr-source-table", kind: "table", title: "Calls by source", dimension: "source", metrics: ["callrail.calls", "callrail.answerRate", "callrail.firstTimeCallers", "callrail.leads"], x: 0, y: 6, w: 7, h: 5 },
    { id: "cr-source-pie", kind: "pie", title: "Share of calls by source", dimension: "source", metrics: ["callrail.calls"], x: 7, y: 6, w: 5, h: 5 },
    { id: "cr-campaign-table", kind: "table", title: "Calls by campaign", dimension: "campaign", metrics: ["callrail.calls", "callrail.answerRate", "callrail.firstTimeCallers", "callrail.leads"], x: 0, y: 11, w: 12, h: 5 },
  ],
};
