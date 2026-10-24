import { describe, expect, it } from "vitest";
import { cleanName, copyWidgets, planTemplateApplication, resolveTemplateChoice, uniqueName } from "@/lib/dashboards/apply";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";
import type { DashboardWidget } from "@/lib/dashboards/types";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const widgets: DashboardWidget[] = [
  { id: "x1", kind: "kpi", metrics: ["ads.spend"], x: 0, y: 3, w: 2, h: 2 },
  { id: "x2", kind: "text", text: "Hi", x: 2, y: 3, w: 4, h: 2 },
  { id: "x3", kind: "kpi", metrics: [], x: 0, y: 0, w: 2, h: 2 } as DashboardWidget, // invalid: no metric
];

describe("template application", () => {
  it("resolves blank, built-in and agency choices", () => {
    expect(resolveTemplateChoice("blank", DASHBOARD_TEMPLATES, [])).toEqual({ name: "New dashboard", widgets: [] });
    expect(resolveTemplateChoice("builtin:ads-overview", DASHBOARD_TEMPLATES, [])?.name).toBe("Ads overview");
    expect(resolveTemplateChoice("builtin:nope", DASHBOARD_TEMPLATES, [])).toBeNull();
    const agency = [{ id: "t1", name: "Agency SEO", widgets, defaultRange: "last_90" }];
    const r = resolveTemplateChoice("agency:t1", DASHBOARD_TEMPLATES, agency);
    expect(r).toMatchObject({ name: "Agency SEO", defaultRange: "last_90" });
    expect(r!.widgets.map((w) => w.id)).toEqual(["x1", "x2"]); // invalid widget dropped
    expect(resolveTemplateChoice("agency:other", DASHBOARD_TEMPLATES, agency)).toBeNull();
    expect(resolveTemplateChoice("garbage", DASHBOARD_TEMPLATES, agency)).toBeNull();
  });

  it("names copies uniquely per client", () => {
    expect(uniqueName("Ads overview", [])).toBe("Ads overview");
    expect(uniqueName("Ads overview", ["ads overview"])).toBe("Ads overview (2)");
    expect(uniqueName("Ads overview (2)", ["Ads overview", "Ads overview (2)"])).toBe("Ads overview (3)");
    expect(cleanName("   ")).toBe("Untitled dashboard");
    expect(cleanName("a\n  b")).toBe("a b");
    expect(cleanName("x".repeat(200))).toHaveLength(80);
  });

  it("copies widgets with fresh ids, drops invalid ones and closes gaps", () => {
    const out = copyWidgets(widgets, ids());
    expect(out).toEqual([
      { id: "id1", kind: "kpi", metrics: ["ads.spend"], x: 0, y: 0, w: 2, h: 2 },
      { id: "id2", kind: "text", text: "Hi", x: 2, y: 0, w: 4, h: 2 },
    ]);
    expect(widgets[0].id).toBe("x1"); // source untouched
  });

  it("plans one dashboard per client after its existing ones", () => {
    const plans = planTemplateApplication({ name: "Monthly", widgets, defaultRange: "last_month" }, [
      { clientId: "c1", existingNames: [], maxPosition: -1 },
      { clientId: "c2", existingNames: ["Monthly"], maxPosition: 4 },
      { clientId: "c1", existingNames: [], maxPosition: -1 }, // duplicate target ignored
    ], ids());
    expect(plans.map((p) => [p.clientId, p.name, p.position, p.defaultRange])).toEqual([
      ["c1", "Monthly", 0, "last_month"],
      ["c2", "Monthly (2)", 5, "last_month"],
    ]);
    // Each client gets its own widget ids.
    expect(new Set(plans.flatMap((p) => p.widgets.map((w) => w.id))).size).toBe(4);
  });
});
