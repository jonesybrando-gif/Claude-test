// Render-ready data for one dashboard widget, produced on the server by
// src/server/dashboards/data.ts and passed to client components. Plain JSON.

import type { MetricSource } from "@/lib/metrics-registry";
import type { MetricInfo, Tone } from "./metrics";

export interface KeywordRankRow {
  keyword: string;
  /** Latest position in the range (null = not ranking in the tracked depth). */
  position: number | null;
  /** Position at the end of the comparison period. */
  previous: number | null;
  url?: string | null;
  searchVolume?: number | null;
  location?: string | null;
}

export type WidgetData =
  | { kind: "kpi"; metric: MetricInfo; value: number | null; previous: number | null; changePct: number | null; tone: Tone | null; spark: (number | null)[]; hasComparison: boolean }
  | { kind: "series"; metrics: MetricInfo[]; dates: string[]; current: Record<string, (number | null)[]>; previous: Record<string, (number | null)[]> | null; previousDates: string[] | null }
  | { kind: "breakdown"; metrics: MetricInfo[]; dimensionLabel: string; rows: { label: string; values: Record<string, number | null> }[] }
  | { kind: "rankings"; rows: KeywordRankRow[]; hasComparison: boolean }
  | { kind: "text" }
  | { kind: "pacing" }
  | { kind: "campaigns" }
  | { kind: "empty"; reason: "not_connected" | "no_data" | "unknown_metric"; source: MetricSource | null; message: string };

export type DashboardData = Record<string, WidgetData>;
