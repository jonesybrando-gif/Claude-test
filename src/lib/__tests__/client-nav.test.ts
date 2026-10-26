import { describe, expect, it } from "vitest";
import { clientBackHref, encodeRangeCookie, reportQuery, shortRangeLabel, switchClientHref, withRangeFallback, withReportQuery } from "../client-nav";

describe("reportQuery / withReportQuery", () => {
  it("keeps only the report keys", () => {
    expect(reportQuery({ range: "last_30", compare: "none", tab: "setup", notice: "Saved", line: "x" })).toBe("range=last_30&compare=none&tab=setup");
    expect(reportQuery({ range: "last_30", tab: "setup" }, { tab: false })).toBe("range=last_30");
  });
  it("appends before a hash and after an existing query", () => {
    expect(withReportQuery("/clients/a/share#schedule", { range: "mtd" })).toBe("/clients/a/share?range=mtd#schedule");
    expect(withReportQuery("/clients/a/campaigns?x=1", { range: "mtd" })).toBe("/clients/a/campaigns?x=1&range=mtd");
    expect(withReportQuery("/clients/a", {})).toBe("/clients/a");
  });
  it("back link keeps range, comparison and tab, with a fallback tab", () => {
    expect(clientBackHref("a", { range: "custom", from: "2026-09-01", to: "2026-09-30", compare: "none" })).toBe("/clients/a?range=custom&compare=none&from=2026-09-01&to=2026-09-30");
    expect(clientBackHref("a", { range: "mtd" }, "setup")).toBe("/clients/a?range=mtd&tab=setup");
    expect(clientBackHref("a", { tab: "trends" }, "setup")).toBe("/clients/a?tab=trends");
  });
});

describe("switchClientHref", () => {
  it("keeps the sub-page and the report keys", () => {
    expect(switchClientHref("/clients/a/budgets", "range=last_7&notice=Saved", "b")).toBe("/clients/b/budgets?range=last_7");
    expect(switchClientHref("/clients/a", "tab=trends&compare=none", "b")).toBe("/clients/b?compare=none&tab=trends");
  });
  it("falls back to the report for deeper pages", () => {
    expect(switchClientHref("/clients/a/dashboards/xyz/edit", "", "b")).toBe("/clients/b");
    expect(switchClientHref("/clients/a/accounts/google-ads", "connection=1", "b")).toBe("/clients/b");
  });
});

describe("range cookie", () => {
  it("encodes only range keys", () => {
    expect(encodeRangeCookie({ range: "last_30", compare: "previous_period", from: null, to: null })).toBe("range=last_30&compare=previous_period");
  });
  it("fills the range only when the URL has none", () => {
    const cookie = "range=last_30&compare=none";
    expect(withRangeFallback({ tab: "trends" }, cookie)).toEqual({ tab: "trends", range: "last_30", compare: "none" });
    expect(withRangeFallback({ range: "mtd" }, cookie)).toEqual({ range: "mtd" });
    expect(withRangeFallback({ compare: "previous_month" }, cookie)).toEqual({ range: "last_30", compare: "previous_month" });
    expect(withRangeFallback({}, undefined)).toEqual({});
    expect(withRangeFallback({}, "garbage")).toEqual({});
  });
  it("restores custom dates", () => {
    expect(withRangeFallback({}, "range=custom&from=2026-09-01&to=2026-09-30")).toEqual({ range: "custom", from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("shortRangeLabel", () => {
  it("is short", () => {
    expect(shortRangeLabel("2026-09-01", "2026-09-30")).toBe("Sep 1–30");
    expect(shortRangeLabel("2026-08-28", "2026-09-03")).toBe("Aug 28 – Sep 3");
    expect(shortRangeLabel("2026-09-03", "2026-09-03")).toBe("Sep 3");
    expect(shortRangeLabel("2025-12-01", "2026-01-03")).toBe("Dec 1, 2025 – Jan 3, 2026");
  });
});
