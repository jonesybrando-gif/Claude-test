import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/metrics-registry/index", () => {
  const metrics = [
    { key: "t.sessions", source: "ga4", label: "Sessions", format: "count", aggregation: "sum", better: "up", description: "" },
    { key: "t.engaged", source: "ga4", label: "Engaged", format: "count", aggregation: "sum", better: "up", description: "" },
    { key: "t.rate", source: "ga4", label: "Rate", format: "pct", aggregation: "weighted", ratioOf: { numerator: "t.engaged", denominator: "t.sessions" }, better: "up", description: "" },
    { key: "t.followers", source: "facebook", label: "Followers", format: "count", aggregation: "last", better: "up", description: "" },
  ];
  return { METRICS: metrics, METRIC_BY_KEY: Object.fromEntries(metrics.map((m) => [m.key, m])) };
});

import { aggregateMetric } from "@/lib/metrics-registry/aggregate";

describe("aggregateMetric", () => {
  const d = (date: string, value: number) => ({ date, value });
  it("sums", () => expect(aggregateMetric("t.sessions", [d("2026-10-01", 10), d("2026-10-02", 5)])).toBe(15));
  it("takes the latest day for 'last'", () => expect(aggregateMetric("t.followers", [d("2026-10-02", 120), d("2026-10-01", 100)])).toBe(120));
  it("computes weighted ratios from summed parts", () =>
    expect(aggregateMetric("t.rate", [], { "t.engaged": [d("2026-10-01", 5), d("2026-10-02", 5)], "t.sessions": [d("2026-10-01", 10), d("2026-10-02", 30)] })).toBe(25));
  it("returns null without data or unknown keys", () => {
    expect(aggregateMetric("t.sessions", [])).toBeNull();
    expect(aggregateMetric("nope", [d("2026-10-01", 1)])).toBeNull();
  });
});
