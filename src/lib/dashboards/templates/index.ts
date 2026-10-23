// Ready-made dashboard templates offered when creating a dashboard. Each source
// adds ONE import and ONE entry (alphabetical). See ../types.ts for widgets.
import type { DashboardWidget } from "../types";
import { callrailTemplate } from "./callrail";
import { ga4Template } from "./ga4";
import { gbpTemplate } from "./gbp";
import { seoTemplate } from "./seo";

export interface DashboardTemplateDef {
  key: string;
  name: string;
  description: string;
  /** Sources the template needs (shown as "needs GA4"). "ads" = ad platforms. */
  sources: string[];
  widgets: DashboardWidget[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplateDef[] = [
  callrailTemplate,
  ga4Template,
  gbpTemplate,
  seoTemplate,
];
