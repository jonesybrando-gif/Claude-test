// CallRail call-tracking metrics. Stored daily per CallRail company, bucketed
// by the company's time zone (src/server/data-sources/callrail/metrics.ts).
import type { DimensionDef, MetricDef } from "./types";

const BREAKDOWNS = ["source", "campaign"];

export const metrics: MetricDef[] = [
  { key: "callrail.calls", source: "callrail", label: "Calls", format: "count", aggregation: "sum", better: "up", description: "Tracked phone calls (CallRail).", dimensions: [...BREAKDOWNS, "keyword"] },
  { key: "callrail.answered", source: "callrail", label: "Answered calls", short: "Answered", format: "count", aggregation: "sum", better: "up", description: "Calls that were answered (not missed and not sent to voicemail).", dimensions: BREAKDOWNS },
  { key: "callrail.missed", source: "callrail", label: "Missed calls", short: "Missed", format: "count", aggregation: "sum", better: "down", description: "Calls that weren't answered or went to voicemail." },
  { key: "callrail.answerRate", source: "callrail", label: "Answer rate", format: "pct", aggregation: "weighted", ratioOf: { numerator: "callrail.answered", denominator: "callrail.calls" }, better: "up", description: "Answered calls as a share of all calls.", dimensions: BREAKDOWNS },
  { key: "callrail.firstTimeCallers", source: "callrail", label: "First-time callers", short: "First-time", format: "count", aggregation: "sum", better: "up", description: "Calls from numbers calling the company for the first time.", dimensions: BREAKDOWNS },
  { key: "callrail.leads", source: "callrail", label: "Leads", format: "count", aggregation: "sum", better: "up", description: "Calls marked as a good lead in CallRail (lead status).", dimensions: BREAKDOWNS },
  { key: "callrail.durationSeconds", source: "callrail", label: "Talk time", format: "duration", aggregation: "sum", better: "neutral", description: "Total duration of answered calls, in seconds." },
  { key: "callrail.avgDuration", source: "callrail", label: "Avg call duration", short: "Avg duration", format: "duration", aggregation: "weighted", ratioOf: { numerator: "callrail.durationSeconds", denominator: "callrail.answered" }, better: "neutral", description: "Average duration of answered calls." },
  { key: "callrail.forms", source: "callrail", label: "Form submissions", short: "Forms", format: "count", aggregation: "sum", better: "up", description: "Form submissions tracked by CallRail form tracking (when enabled).", dimensions: ["source"] },
];

export const dimensions: DimensionDef[] = [
  { key: "callrail.source", source: "callrail", dimension: "source", label: "Call source" },
  { key: "callrail.campaign", source: "callrail", dimension: "campaign", label: "Campaign / tracking number" },
  { key: "callrail.keyword", source: "callrail", dimension: "keyword", label: "Keyword" },
];
