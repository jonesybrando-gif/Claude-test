// Registry of every non-ad metric. Each source adds ONE import + spread line
// below (keep them alphabetical to make merges trivial).
import type { DimensionDef, MetricDef, MetricSource } from "./types";
import * as callrail from "./callrail";
import * as facebook from "./facebook";
import * as ga4 from "./ga4";
import * as gbp from "./gbp";
import * as gsc from "./gsc";
import * as instagram from "./instagram";
import * as rank from "./rank";
import { PLAIN } from "./plain";

// --- source registrations (one line each) ---
const SOURCES: { metrics: MetricDef[]; dimensions?: DimensionDef[] }[] = [
  callrail,
  facebook,
  ga4,
  gbp,
  gsc,
  instagram,
  rank,
];
// --- end source registrations ---

export const METRICS: (MetricDef & { plain: string })[] = SOURCES.flatMap((s) => s.metrics).map((m) => ({ ...m, plain: m.plain ?? PLAIN[m.key] ?? m.description }));
export const DIMENSIONS: DimensionDef[] = SOURCES.flatMap((s) => s.dimensions ?? []);
export const METRIC_BY_KEY: Record<string, MetricDef & { plain: string }> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export const isMetricKey = (k: unknown): k is string => typeof k === "string" && k in METRIC_BY_KEY;
export const metricsForSource = (source: MetricSource) => METRICS.filter((m) => m.source === source);

export type { MetricDef, DimensionDef, MetricSource } from "./types";
