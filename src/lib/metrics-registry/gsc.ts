// Google Search Console metrics. Stored daily as account totals and as
// breakdowns by query, page, country and device (see
// src/server/data-sources/google/gsc.ts). CTR and average position are derived
// from the stored sums so they combine correctly over any date range.
import type { DimensionDef, MetricDef } from "./types";

const DIMS = ["query", "page", "country", "device"];

export const metrics: MetricDef[] = [
  {
    key: "gsc.clicks",
    source: "gsc",
    label: "Organic clicks",
    short: "Clicks",
    format: "count",
    aggregation: "sum",
    better: "up",
    description: "Clicks from Google Search results to the site (Search Console, web search).",
    dimensions: DIMS,
  },
  {
    key: "gsc.impressions",
    source: "gsc",
    label: "Search impressions",
    short: "Impressions",
    format: "count",
    aggregation: "sum",
    better: "up",
    description: "Times a link to the site appeared in Google Search results.",
    dimensions: DIMS,
  },
  {
    key: "gsc.ctr",
    source: "gsc",
    label: "Organic CTR",
    short: "CTR",
    format: "pct",
    aggregation: "weighted",
    ratioOf: { numerator: "gsc.clicks", denominator: "gsc.impressions" },
    better: "up",
    description: "Clicks divided by impressions in Google Search.",
    dimensions: DIMS,
  },
  {
    key: "gsc.position",
    source: "gsc",
    label: "Average position",
    short: "Avg. position",
    format: "position",
    aggregation: "weighted",
    ratioOf: { numerator: "gsc.positionWeighted", denominator: "gsc.impressions" },
    better: "down",
    description: "Impression-weighted average ranking position in Google Search (1 = top). Lower is better.",
    dimensions: DIMS,
  },
  {
    key: "gsc.positionWeighted",
    source: "gsc",
    label: "Position × impressions",
    format: "ratio",
    aggregation: "sum",
    better: "neutral",
    description: "Internal: average position multiplied by impressions, summed. Used to compute impression-weighted average position.",
    dimensions: DIMS,
  },
];

export const dimensions: DimensionDef[] = [
  { key: "gsc.query", source: "gsc", dimension: "query", label: "Search query" },
  { key: "gsc.page", source: "gsc", dimension: "page", label: "Landing page" },
  { key: "gsc.country", source: "gsc", dimension: "country", label: "Country" },
  { key: "gsc.device", source: "gsc", dimension: "device", label: "Device" },
];
