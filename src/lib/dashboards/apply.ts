// Turning templates (built-in or agency-saved) into client dashboards. Pure,
// so the naming, copying and placement rules are unit-tested.

import type { DashboardTemplateDef } from "./templates";
import type { DashboardWidget } from "./types";
import { compact, newWidgetId, withFreshIds } from "./layout";
import { readWidgets } from "./parse";

export const MAX_NAME = 80;

export interface TemplateSource {
  name: string;
  widgets: DashboardWidget[];
  defaultRange?: string;
}

/** Agency templates as the "new dashboard" picker needs them. */
export interface AgencyTemplateRef {
  id: string;
  name: string;
  widgets: unknown;
  defaultRange: string;
}

/** "Blank" | "builtin:<key>" | "agency:<id>" → what to copy, or null if it no longer exists. */
export function resolveTemplateChoice(choice: string, builtins: DashboardTemplateDef[], agency: AgencyTemplateRef[]): TemplateSource | null {
  if (!choice || choice === "blank") return { name: "New dashboard", widgets: [] };
  if (choice.startsWith("builtin:")) {
    const t = builtins.find((b) => b.key === choice.slice(8));
    return t ? { name: t.name, widgets: t.widgets } : null;
  }
  if (choice.startsWith("agency:")) {
    const t = agency.find((a) => a.id === choice.slice(7));
    return t ? { name: t.name, widgets: readWidgets(t.widgets), defaultRange: t.defaultRange } : null;
  }
  return null;
}

export function cleanName(name: unknown, fallback = "Untitled dashboard"): string {
  const s = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "";
  return s || fallback;
}

/** "Ads overview", then "Ads overview (2)", "(3)"… so a client's dashboards stay distinguishable. */
export function uniqueName(base: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const root = cleanName(base).replace(/ \(\d+\)$/, "");
  if (!taken.has(root.toLowerCase())) return root;
  for (let i = 2; i < 1000; i++) {
    const n = `${root} (${i})`.slice(0, MAX_NAME);
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${root} (${Date.now()})`.slice(0, MAX_NAME);
}

/** Widgets for a new copy: fresh ids, invalid ones dropped, gaps closed. */
export function copyWidgets(ws: DashboardWidget[], makeId: () => string = newWidgetId): DashboardWidget[] {
  return compact(withFreshIds(readWidgets(ws), makeId));
}

export interface ClientTarget {
  clientId: string;
  /** Names of the client's existing dashboards. */
  existingNames: string[];
  /** Highest position among its dashboards (-1 when it has none). */
  maxPosition: number;
}

export interface NewDashboardPlan {
  clientId: string;
  name: string;
  position: number;
  defaultRange: string;
  widgets: DashboardWidget[];
}

/** One new dashboard per target client, appended after its existing dashboards. */
export function planTemplateApplication(tpl: TemplateSource, targets: ClientTarget[], makeId: () => string = newWidgetId): NewDashboardPlan[] {
  const seen = new Set<string>();
  return targets
    .filter((t) => !seen.has(t.clientId) && seen.add(t.clientId))
    .map((t) => ({
      clientId: t.clientId,
      name: uniqueName(tpl.name, t.existingNames),
      position: t.maxPosition + 1,
      defaultRange: tpl.defaultRange ?? "last_30",
      widgets: copyWidgets(tpl.widgets, makeId),
    }));
}
