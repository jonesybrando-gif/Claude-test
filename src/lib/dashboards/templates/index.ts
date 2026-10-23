// Ready-made dashboard templates offered when creating a dashboard. Each source
// adds ONE import and ONE entry (alphabetical). See ../types.ts for widgets.
import type { DashboardWidget } from "../types";
import { ga4Template } from "./ga4";

export interface DashboardTemplateDef {
  key: string;
  name: string;
  description: string;
  /** Sources the template needs (shown as "needs GA4"). "ads" = ad platforms. */
  sources: string[];
  widgets: DashboardWidget[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplateDef[] = [
  ga4Template,
];
