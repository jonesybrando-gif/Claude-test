import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE, parseTemplate, templateFromForm } from "../report-template";

function form(entries: [string, string][]) {
  return { getAll: (k: string) => entries.filter(([a]) => a === k).map(([, v]) => v), get: (k: string) => entries.find(([a]) => a === k)?.[1] ?? null };
}

describe("report templates", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseTemplate(null)).toEqual(DEFAULT_TEMPLATE);
    const t = parseTemplate({ kpis: ["clicks", "bogus", "clicks"], defaultRange: "forever", sections: { pacing: false, hack: true }, title: "  " });
    expect(t.kpis).toEqual(["clicks"]);
    expect(t.defaultRange).toBe(DEFAULT_TEMPLATE.defaultRange);
    expect(t.sections.pacing).toBe(false);
    expect("hack" in t.sections).toBe(false);
    expect(t.title).toBe(DEFAULT_TEMPLATE.title);
  });

  it("an empty KPI list keeps the base KPIs; a client template inherits the agency default", () => {
    const agency = parseTemplate({ title: "Monthly review", kpis: ["spend", "leads"] });
    const client = parseTemplate({ kpis: [] }, agency);
    expect(client.title).toBe("Monthly review");
    expect(client.kpis).toEqual(["spend", "leads"]);
  });

  it("builds from the builder form, keeping the arranged order and validating limits", () => {
    const { template, problems } = templateFromForm(
      form([
        ["title", "Q4 report"],
        ["kpis", "leads"],
        ["kpis", "spend"],
        ["trendKpis", "leads"],
        ["section:kpis", "on"],
        ["section:summary", "on"],
        ["defaultRange", "last_30"],
        ["compare", "previous_month"],
        ["summary", "Strong month."],
      ]),
    );
    expect(problems).toEqual([]);
    expect(template.kpis).toEqual(["leads", "spend"]);
    expect(template.executiveAi).toBe(true);
    expect(template.sections).toMatchObject({ kpis: true, summary: true, executive: false, pacing: false, platforms: false });
    expect(parseTemplate({ sections: { pacing: false } }).sections.executive).toBe(true); // older saved layouts get the new section
    expect(template).toMatchObject({ title: "Q4 report", defaultRange: "last_30", compare: "previous_month", summary: "Strong month." });
    expect(templateFromForm(form([["title", "x"]])).problems).toContain("Choose at least one KPI.");
    const tooMany = templateFromForm(form(["spend", "clicks", "ctr", "leads"].map((k) => ["trendKpis", k] as [string, string]).concat([["kpis", "spend"]])));
    expect(tooMany.problems).toContain("Choose at most 3 trend charts.");
  });
});
