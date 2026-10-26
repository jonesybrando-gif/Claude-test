import type { DashboardTemplateDef } from "./index";

/**
 * Call tracking report in the shape agencies expect from AgencyAnalytics'
 * CallRail dashboards: headline call KPIs, answered vs missed trend, calls by
 * source / medium / campaign / keyword / landing page / city, when people
 * call, and the call log.
 */
export const callrailTemplate: DashboardTemplateDef = {
  key: "callrail-calls",
  name: "Calls (CallRail)",
  description: "Calls, answered vs missed, first-time callers, durations, leads and value; calls by source, campaign, keyword, landing page, city, day and hour; and the call log with recordings.",
  sources: ["callrail"],
  widgets: [
    { id: "cr-calls", kind: "kpi", metrics: ["callrail.calls"], x: 0, y: 0, w: 2, h: 2 },
    { id: "cr-answered", kind: "kpi", metrics: ["callrail.answered"], x: 2, y: 0, w: 2, h: 2 },
    { id: "cr-missed", kind: "kpi", metrics: ["callrail.missed"], x: 4, y: 0, w: 2, h: 2 },
    { id: "cr-answer-rate", kind: "kpi", metrics: ["callrail.answerRate"], x: 6, y: 0, w: 2, h: 2 },
    { id: "cr-first-time", kind: "kpi", metrics: ["callrail.firstTimeCallers"], x: 8, y: 0, w: 2, h: 2 },
    { id: "cr-avg-duration", kind: "kpi", metrics: ["callrail.avgDuration"], x: 10, y: 0, w: 2, h: 2 },
    { id: "cr-voicemails", kind: "kpi", metrics: ["callrail.voicemails"], x: 0, y: 2, w: 2, h: 2 },
    { id: "cr-miss-rate", kind: "kpi", metrics: ["callrail.missRate"], x: 2, y: 2, w: 2, h: 2 },
    { id: "cr-new-rate", kind: "kpi", metrics: ["callrail.newCallerRate"], x: 4, y: 2, w: 2, h: 2 },
    { id: "cr-talk-time", kind: "kpi", metrics: ["callrail.durationSeconds"], x: 6, y: 2, w: 2, h: 2 },
    { id: "cr-leads", kind: "kpi", metrics: ["callrail.leads"], x: 8, y: 2, w: 2, h: 2 },
    { id: "cr-forms", kind: "kpi", metrics: ["callrail.forms"], x: 10, y: 2, w: 2, h: 2 },
    { id: "cr-calls-line", kind: "line", title: "Calls over time", metrics: ["callrail.calls", "callrail.answered", "callrail.missed"], x: 0, y: 4, w: 12, h: 4 },
    { id: "cr-source-table", kind: "table", title: "Calls by source", dimension: "source", metrics: ["callrail.calls", "callrail.answered", "callrail.missed", "callrail.answerRate", "callrail.firstTimeCallers", "callrail.avgDuration"], x: 0, y: 8, w: 7, h: 5 },
    { id: "cr-source-pie", kind: "pie", title: "Share of calls by source", dimension: "source", metrics: ["callrail.calls"], x: 7, y: 8, w: 5, h: 5 },
    { id: "cr-campaign-table", kind: "table", title: "Calls by campaign / tracking number", dimension: "campaign", metrics: ["callrail.calls", "callrail.answered", "callrail.missed", "callrail.answerRate", "callrail.firstTimeCallers", "callrail.leads"], x: 0, y: 13, w: 12, h: 5 },
    { id: "cr-medium-pie", kind: "pie", title: "Calls by medium", dimension: "medium", metrics: ["callrail.calls"], x: 0, y: 18, w: 4, h: 5 },
    { id: "cr-keyword-table", kind: "table", title: "Calls by keyword", dimension: "keyword", metrics: ["callrail.calls", "callrail.answered", "callrail.firstTimeCallers"], x: 4, y: 18, w: 8, h: 5 },
    { id: "cr-landing-table", kind: "table", title: "Calls by landing page", dimension: "landingPage", metrics: ["callrail.calls", "callrail.answered", "callrail.firstTimeCallers"], x: 0, y: 23, w: 6, h: 5 },
    { id: "cr-city-table", kind: "table", title: "Calls by caller city", dimension: "city", metrics: ["callrail.calls", "callrail.answered", "callrail.firstTimeCallers"], x: 6, y: 23, w: 6, h: 5 },
    { id: "cr-weekday-bar", kind: "bar", title: "Calls by day of week", dimension: "weekday", metrics: ["callrail.calls"], x: 0, y: 28, w: 6, h: 4 },
    { id: "cr-hour-bar", kind: "bar", title: "Calls by hour of day", dimension: "hour", metrics: ["callrail.calls"], x: 6, y: 28, w: 6, h: 4 },
    { id: "cr-call-log", kind: "calllog", title: "Call log", x: 0, y: 32, w: 12, h: 8 },
  ],
};
