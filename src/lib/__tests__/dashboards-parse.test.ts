import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/metrics-registry", async () => (await import("./fixtures/dashboard-registry")).registryMock);

import { MAX_WIDGETS, parseWidgets, readWidgets } from "@/lib/dashboards/parse";
import { compact, findSpot, moveWidget, overlaps, resizeWidget } from "@/lib/dashboards/layout";
import type { DashboardWidget } from "@/lib/dashboards/types";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";

const kpi = (id: string, x = 0, y = 0, extra: Partial<DashboardWidget> = {}): DashboardWidget => ({ id, kind: "kpi", metrics: ["ads.spend"], x, y, w: 2, h: 2, ...extra });
const err = (input: unknown) => {
  const r = parseWidgets(input);
  return r.ok ? null : r.error;
};

describe("parseWidgets", () => {
  it("accepts valid widgets and drops unknown fields", () => {
    const r = parseWidgets([
      { ...kpi("a"), junk: 1, title: "  Spend  " },
      { id: "b", kind: "line", metrics: ["ads.clicks", "ga4.sessions"], x: 2, y: 0, w: 10, h: 4 },
      { id: "c", kind: "table", metrics: ["gsc.clicks", "gsc.position"], dimension: "query", x: 0, y: 4, w: 6, h: 5, range: "last_7" },
      { id: "d", kind: "text", text: "# Hello", x: 6, y: 4, w: 6, h: 2 },
      { id: "e", kind: "pacing", metrics: ["ads.spend"], x: 0, y: 9, w: 12, h: 6 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.widgets[0]).toEqual({ id: "a", kind: "kpi", metrics: ["ads.spend"], title: "Spend", x: 0, y: 0, w: 2, h: 2 });
    expect(r.widgets[2].range).toBe("last_7");
    expect(r.widgets[4].metrics).toBeUndefined(); // pacing takes no metrics
  });

  it("enforces the 12-column grid", () => {
    expect(err([kpi("a", 11)])).toMatch(/wider than the 12-column grid/);
    expect(err([kpi("a", -1)])).toMatch(/outside the grid/);
    expect(err([{ ...kpi("a"), w: 1.5 }])).toMatch(/whole-number/);
    expect(err([{ ...kpi("a"), w: 1 }])).toMatch(/too small/);
    expect(err([{ ...kpi("a"), h: 40 }])).toMatch(/too tall/);
    expect(err([{ id: "p", kind: "pacing", x: 0, y: 0, w: 13, h: 6 }])).toMatch(/wider/);
  });

  it(`allows at most ${MAX_WIDGETS} widgets`, () => {
    const many = Array.from({ length: MAX_WIDGETS }, (_, i) => kpi(`k${i}`, (i % 6) * 2, Math.floor(i / 6) * 2));
    expect(parseWidgets(many).ok).toBe(true);
    expect(err([...many, kpi("extra", 0, 100)])).toMatch(/at most 40/);
  });

  it("rejects bad ids, kinds, metrics and breakdowns", () => {
    expect(err("nope")).toMatch(/list/);
    expect(err([kpi("a"), kpi("a", 2)])).toMatch(/repeats/);
    expect(err([{ ...kpi("a"), id: "bad id!" }])).toMatch(/invalid id/);
    expect(err([{ ...kpi("a"), kind: "gauge" }])).toMatch(/unknown type/);
    expect(err([{ ...kpi("a"), metrics: [] }])).toMatch(/at least 1 metric/);
    expect(err([{ ...kpi("a"), metrics: ["ads.spend", "ads.clicks"] }])).toMatch(/at most 1 metric/);
    expect(err([{ ...kpi("a"), metrics: ["ads.nope"] }])).toMatch(/unknown metric/);
    expect(err([{ ...kpi("a"), metrics: ["ga4.nope"] }])).toMatch(/unknown metric/);
    expect(err([{ id: "t", kind: "table", metrics: ["gsc.clicks"], x: 0, y: 0, w: 6, h: 4 }])).toMatch(/needs a breakdown/);
    expect(err([{ id: "t", kind: "table", metrics: ["gsc.clicks", "ga4.sessions"], dimension: "query", x: 0, y: 0, w: 6, h: 4 }])).toMatch(/one source/);
    expect(err([{ id: "t", kind: "text", x: 0, y: 0, w: 4, h: 2 }])).toMatch(/needs some text/);
    expect(err([{ ...kpi("a"), range: "yesterday" }])).toMatch(/date range/);
    expect(err([{ ...kpi("a"), title: "x".repeat(121) }])).toMatch(/title/);
  });

  it("lets the caller decide which metrics exist", () => {
    expect(parseWidgets([{ ...kpi("a"), metrics: ["fb.reach"] }], { isKnownMetric: () => true }).ok).toBe(true);
  });

  it("validates every built-in template", () => {
    for (const t of DASHBOARD_TEMPLATES) expect(parseWidgets(t.widgets), t.key).toMatchObject({ ok: true });
  });
});

describe("readWidgets", () => {
  it("keeps valid widgets, drops broken ones, and tolerates metrics from sources not installed", () => {
    const out = readWidgets([kpi("a"), { id: "b", kind: "nope" }, { ...kpi("c", 2), metrics: ["fbx.reach"] }, kpi("a", 4), null]);
    expect(out.map((w) => w.id)).toEqual(["a", "c"]);
    expect(readWidgets({})).toEqual([]);
  });
});

describe("grid layout", () => {
  const ws = (): DashboardWidget[] => [kpi("a", 0, 0), kpi("b", 2, 0), { id: "c", kind: "line", metrics: ["ads.spend"], x: 0, y: 2, w: 6, h: 4 }];
  const noOverlaps = (list: DashboardWidget[]) => list.every((a) => list.every((b) => !overlaps(a, b)));

  it("moves a widget onto another and pushes the other down without overlaps", () => {
    const out = moveWidget(ws(), "c", 0, 0);
    expect(out.find((w) => w.id === "c")).toMatchObject({ x: 0, y: 0 });
    expect(noOverlaps(out)).toBe(true);
  });

  it("clamps moves to the grid and floats widgets up", () => {
    const out = moveWidget(ws(), "b", 20, 9);
    expect(out.find((w) => w.id === "b")).toMatchObject({ x: 10, y: 0 });
  });

  it("resizes within limits", () => {
    const out = resizeWidget(ws(), "a", 1, 50);
    expect(out.find((w) => w.id === "a")).toMatchObject({ w: 2, h: 16 });
    expect(noOverlaps(out)).toBe(true);
    expect(resizeWidget(ws(), "b", 20, 2).find((w) => w.id === "b")!.w).toBe(10);
  });

  it("compacts gaps and finds free spots", () => {
    expect(compact([kpi("a", 0, 5)])[0].y).toBe(0);
    expect(findSpot(ws(), 2, 2)).toEqual({ x: 4, y: 0 });
    expect(findSpot([{ id: "full", x: 0, y: 0, w: 12, h: 3 }], 4, 2)).toEqual({ x: 0, y: 3 });
  });
});
