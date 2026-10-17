// Metric aggregation. Ratios are always recomputed from summed components,
// never averaged, so totals reconcile with the underlying daily rows.

export interface MetricTotals {
  costMinor: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueMinor: number;
  leads: number;
  hasEstimatedCost: boolean;
}

export const emptyTotals = (): MetricTotals => ({
  costMinor: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  conversionValueMinor: 0,
  leads: 0,
  hasEstimatedCost: false,
});

export function addInto(t: MetricTotals, r: Omit<MetricTotals, "hasEstimatedCost"> & { hasEstimatedCost?: boolean }): MetricTotals {
  t.costMinor += r.costMinor;
  t.impressions += r.impressions;
  t.clicks += r.clicks;
  t.conversions += r.conversions;
  t.conversionValueMinor += r.conversionValueMinor;
  t.leads += r.leads;
  t.hasEstimatedCost ||= !!r.hasEstimatedCost;
  return t;
}

export interface DerivedMetrics {
  ctr: number | null; // %
  cpcMinor: number | null;
  cpmMinor: number | null;
  costPerConversionMinor: number | null;
  costPerLeadMinor: number | null;
  conversionRate: number | null; // % of clicks
  roas: number | null; // conversion value ÷ cost
}

export function derive(t: MetricTotals): DerivedMetrics {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
    cpcMinor: div(t.costMinor, t.clicks),
    cpmMinor: t.impressions > 0 ? (t.costMinor / t.impressions) * 1000 : null,
    costPerConversionMinor: div(t.costMinor, t.conversions),
    costPerLeadMinor: div(t.costMinor, t.leads),
    conversionRate: t.clicks > 0 ? (t.conversions / t.clicks) * 100 : null,
    roas: div(t.conversionValueMinor, t.costMinor),
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
