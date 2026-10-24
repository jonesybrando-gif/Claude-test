import { describe, expect, it } from "vitest";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";
import { parseWidgets } from "@/lib/dashboards/parse";
import { METRICS } from "@/lib/metrics-registry";

// Runs against the real metric registry, so every source's template must only
// use metrics that source actually registers.
describe("built-in dashboard templates", () => {
  it("all validate", () => {
    for (const t of DASHBOARD_TEMPLATES) expect(parseWidgets(t.widgets), t.key).toMatchObject({ ok: true });
  });
  it("have unique keys", () => {
    const keys = DASHBOARD_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("registry metric keys are unique", () => {
    const keys = METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
