// Metric aggregation. Ratios are always recomputed from summed components,
// never averaged, so totals reconcile with the underlying daily rows.

import type { Platform } from "@prisma/client";

/** Platforms whose APIs report leads, so a zero from them is a real zero. */
export const reportsLeads = (p: Platform): boolean => p === "META_ADS" || p === "GOOGLE_LSA";

export interface MetricTotals {
  costMinor: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueMinor: number;
  leads: number;
  hasEstimatedCost: boolean;
  /** A platform that reports leads (Meta, LSA) contributed, so 0 leads means none, not unknown. */
  leadsReported?: boolean;
  /**
   * Spend on platforms that report leads (Meta, Local Services). Cost per lead
   * divides this, not all spend, by leads: Google Ads and Microsoft spend buys
   * conversions, not reported leads. Kept by `addInto`; absent on a single line.
   */
  leadCostMinor?: number;
}

export const emptyTotals = (): MetricTotals => ({
  costMinor: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  conversionValueMinor: 0,
  leads: 0,
  hasEstimatedCost: false,
  leadsReported: false,
  leadCostMinor: 0,
});

export function addInto(t: MetricTotals, r: Omit<MetricTotals, "hasEstimatedCost"> & { hasEstimatedCost?: boolean }): MetricTotals {
  t.costMinor += r.costMinor;
  t.impressions += r.impressions;
  t.clicks += r.clicks;
  t.conversions += r.conversions;
  t.conversionValueMinor += r.conversionValueMinor;
  t.leads += r.leads;
  t.hasEstimatedCost ||= !!r.hasEstimatedCost;
  t.leadsReported ||= !!r.leadsReported;
  // A total carries its own lead-platform spend (possibly 0); a single platform line falls back to its cost.
  t.leadCostMinor = (t.leadCostMinor ?? 0) + (r.leadCostMinor ?? (r.leadsReported ? r.costMinor : 0));
  return t;
}

export interface DerivedMetrics {
  ctr: number | null; // %
  cpcMinor: number | null;
  cpmMinor: number | null;
  costPerConversionMinor: number | null;
  costPerLeadMinor: number | null;
  conversionRate: number | null; // % of clicks
  roas: number | null; // conversion value ÷ cost; null when no value is reported
}

export function derive(t: MetricTotals): DerivedMetrics {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
    cpcMinor: div(t.costMinor, t.clicks),
    cpmMinor: t.impressions > 0 ? (t.costMinor / t.impressions) * 1000 : null,
    costPerConversionMinor: div(t.costMinor, t.conversions),
    // Lead-platform spend ÷ leads. Leads that cost nothing (e.g. unpriced Local Services leads) have no cost per lead.
    costPerLeadMinor: t.leadCostMinor === undefined ? div(t.costMinor, t.leads) : t.leadCostMinor > 0 ? div(t.leadCostMinor, t.leads) : null,
    conversionRate: t.clicks > 0 ? (t.conversions / t.clicks) * 100 : null,
    // No conversion value reported (e.g. lead-gen or LSA) means ROAS is unknown, not zero.
    roas: t.conversionValueMinor > 0 ? div(t.conversionValueMinor, t.costMinor) : null,
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
