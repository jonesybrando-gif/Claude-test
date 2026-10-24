// Custom dashboards (AgencyAnalytics-style). Stored as Dashboard.widgets JSON;
// always read through parseWidgets in ./parse.ts (added by the dashboards work).

export type WidgetKind =
  | "kpi"        // single number with change vs comparison period (+ sparkline)
  | "line"       // daily series, 1-3 metrics
  | "bar"        // daily or breakdown bars
  | "table"      // breakdown by a dimension (e.g. top GSC queries, GA4 channels, call sources)
  | "pie"        // share by dimension
  | "rankings"   // tracked keyword positions (rank source)
  | "text"       // free text / heading / note
  | "pacing"     // existing budget pacing block (ads)
  | "campaigns"; // existing campaign table (ads)

export interface DashboardWidget {
  id: string;
  kind: WidgetKind;
  title?: string;
  /** Metric keys: ad KPIs use "ads.<KpiKey>" (e.g. "ads.spend"); others from src/lib/metrics-registry. */
  metrics?: string[];
  /** Dimension for table/pie/bar breakdowns, e.g. "query", "channel". */
  dimension?: string;
  /** Text widget content (plain text / simple markdown). */
  text?: string;
  /** Optional per-widget range override (preset key from src/lib/date-ranges). */
  range?: string;
  /** Grid placement (12-column grid; h in row units of ~80px). */
  x: number;
  y: number;
  w: number;
  h: number;
}
