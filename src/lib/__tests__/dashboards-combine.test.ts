import { describe, expect, it } from "vitest";
import { combineTemplates, resolveTemplateChoices } from "@/lib/dashboards/apply";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";
import { MAX_WIDGETS, parseWidgets } from "@/lib/dashboards/parse";
import { overlaps } from "@/lib/dashboards/layout";

describe("resolveTemplateChoices", () => {
  it("is blank when nothing (or only blank) is picked", () => {
    expect(resolveTemplateChoices([], DASHBOARD_TEMPLATES, [])?.widgets).toEqual([]);
    expect(resolveTemplateChoices(["blank"], DASHBOARD_TEMPLATES, [])?.widgets).toEqual([]);
  });

  it("returns a single template unchanged", () => {
    const t = resolveTemplateChoices(["builtin:callrail-calls"], DASHBOARD_TEMPLATES, []);
    expect(t?.name).toBe("Calls (CallRail)");
    expect(t?.widgets.length).toBe(DASHBOARD_TEMPLATES.find((x) => x.key === "callrail-calls")!.widgets.length);
  });

  it("stacks several templates under headings without overlaps", () => {
    const t = resolveTemplateChoices(["builtin:callrail-calls", "builtin:ga4-overview", "blank"], DASHBOARD_TEMPLATES, [])!;
    expect(t.name).toBe("Calls (CallRail) + Website traffic (GA4)");
    const headings = t.widgets.filter((w) => w.kind === "text");
    expect(headings.map((h) => h.text)).toEqual(["## Calls (CallRail)", "## Website traffic (GA4)"]);
    for (const a of t.widgets) for (const b of t.widgets) expect(overlaps(a, b)).toBe(false);
    // GA4's heading sits below everything from CallRail.
    const crBottom = Math.max(...t.widgets.filter((w) => w.id.startsWith("s0-")).map((w) => w.y + w.h));
    expect(headings[1].y).toBe(crBottom);
  });

  it("returns null when a picked template is gone", () => {
    expect(resolveTemplateChoices(["builtin:callrail-calls", "builtin:nope"], DASHBOARD_TEMPLATES, [])).toBeNull();
  });

  it("fits every built-in template combined within the widget limit and validates", () => {
    const all = combineTemplates(DASHBOARD_TEMPLATES.map((t) => ({ name: t.name, widgets: t.widgets })));
    expect(all.widgets.length).toBeLessThanOrEqual(MAX_WIDGETS);
    expect(all.name).toBe("Combined dashboard");
    const r = parseWidgets(all.widgets);
    expect(r.ok).toBe(true);
  });
});
