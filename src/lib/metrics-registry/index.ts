// Registry of every non-ad metric. Each source adds ONE import + spread line
// below (keep them alphabetical to make merges trivial).
import type { DimensionDef, MetricDef, MetricSource } from "./types";
import * as callrail from "./callrail";

// --- source registrations (one line each) ---
const SOURCES: { metrics: MetricDef[]; dimensions?: DimensionDef[] }[] = [
  callrail,
];
// --- end source registrations ---

export const METRICS: MetricDef[] = SOURCES.flatMap((s) => s.metrics);
export const DIMENSIONS: DimensionDef[] = SOURCES.flatMap((s) => s.dimensions ?? []);
export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export const isMetricKey = (k: unknown): k is string => typeof k === "string" && k in METRIC_BY_KEY;
export const metricsForSource = (source: MetricSource) => METRICS.filter((m) => m.source === source);

export type { MetricDef, DimensionDef, MetricSource } from "./types";
