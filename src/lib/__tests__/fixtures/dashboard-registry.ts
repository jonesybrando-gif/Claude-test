// A small metric registry for dashboard tests (the real one is filled by the
// data-source branches). Use with:
//   vi.mock("@/lib/metrics-registry", async () => (await import("./fixtures/dashboard-registry")).registryMock);
import type { DimensionDef, MetricDef, MetricSource } from "@/lib/metrics-registry/types";

const metrics: MetricDef[] = [
  { key: "ga4.sessions", source: "ga4", label: "Sessions", format: "count", aggregation: "sum", better: "up", description: "", dimensions: ["channel"] },
  { key: "ga4.engagementRate", source: "ga4", label: "Engagement rate", format: "pct", aggregation: "weighted", ratioOf: { numerator: "ga4.engaged", denominator: "ga4.sessions" }, better: "up", description: "" },
  { key: "gsc.clicks", source: "gsc", label: "Clicks", format: "count", aggregation: "sum", better: "up", description: "", dimensions: ["query"] },
  { key: "gsc.position", source: "gsc", label: "Avg. position", format: "position", aggregation: "avg", better: "down", description: "" },
  { key: "callrail.calls", source: "callrail", label: "Calls", format: "count", aggregation: "sum", better: "up", description: "", dimensions: ["source"] },
];
const dimensions: DimensionDef[] = [
  { key: "ga4.channel", source: "ga4", dimension: "channel", label: "Channel" },
  { key: "gsc.query", source: "gsc", dimension: "query", label: "Query" },
  { key: "callrail.source", source: "callrail", dimension: "source", label: "Call source" },
];

export const registryMock = {
  METRICS: metrics,
  DIMENSIONS: dimensions,
  METRIC_BY_KEY: Object.fromEntries(metrics.map((m) => [m.key, m])),
  isMetricKey: (k: unknown) => typeof k === "string" && metrics.some((m) => m.key === k),
  metricsForSource: (s: MetricSource) => metrics.filter((m) => m.source === s),
};
