import { describe, expect, it } from "vitest";
import { attentionLines, budgetTile, headlineSentence, pacingHeadline, periodPhrase } from "../at-a-glance";
import { resultsFor } from "../results";
import { displayPacingStatus } from "../pacing/display-status";
import { emptyTotals, type MetricTotals } from "../metrics";

const t = (o: Partial<MetricTotals>): MetricTotals => ({ ...emptyTotals(), ...o });
const sep = { from: "2026-09-01", to: "2026-09-30" };
const aug = { from: "2026-08-01", to: "2026-08-31" };
const today = "2026-10-26";

describe("headline sentence", () => {
  it("leads with results and compares cost per result in words", () => {
    const s = headlineSentence({
      range: sep, comparison: aug, today, currency: "USD",
      results: resultsFor("LEADS", t({ costMinor: 596_100, conversions: 21 })),
      previous: resultsFor("LEADS", t({ costMinor: 456_300, conversions: 22 })),
    });
    expect(s).toBe("In September you spent $5,961 and got 21 leads at about $284 each — 37% more per lead than August.");
  });

  it("leaves the comparison out with too few results or while still counting", () => {
    const base = { range: sep, comparison: aug, today, currency: "USD", results: resultsFor("LEADS", t({ costMinor: 100_000, conversions: 8 })), previous: resultsFor("LEADS", t({ costMinor: 100_000, conversions: 20 })) };
    expect(headlineSentence(base)).toBe("In September you spent $1,000 and got 8 leads at about $125 each.");
    const recent = { ...base, results: resultsFor("LEADS", t({ costMinor: 100_000, conversions: 30 })), stillCounting: true };
    expect(headlineSentence(recent)).not.toContain("than August");
  });

  it("names a driver campaign only when given one", () => {
    const s = headlineSentence({
      range: sep, comparison: null, today, currency: "USD",
      results: resultsFor("CALLS", t({ costMinor: 200_000, conversions: 40 })), previous: null,
      driver: { name: "Emergency", platform: "Google Ads", results: 30, costPerMinor: 4_000, unit: "conversion" },
    });
    expect(s).toBe("In September you spent $2,000 and got 40 calls at about $50.00 each. Emergency (Google Ads) did best, at $40.00 per call.");
  });

  it("covers no results, awareness and sales value", () => {
    expect(headlineSentence({ range: sep, comparison: null, today, currency: "USD", results: resultsFor("LEADS", t({ costMinor: 50_000 })), previous: null })).toBe("In September you spent $500; the ad platforms reported no leads.");
    expect(headlineSentence({ range: sep, comparison: null, today, currency: "USD", results: resultsFor("AWARENESS", t({ costMinor: 50_000, clicks: 400 })), previous: null })).toBe("In September you spent $500 and people clicked your ads 400 times, at about $1.25 per click.");
    expect(headlineSentence({ range: sep, comparison: null, today, currency: "USD", results: resultsFor("SALES", t({ costMinor: 100_000, conversions: 40, conversionValueMinor: 1_830_000 })), previous: null })).toBe(
      "In September you spent $1,000 and got 40 sales at about $25.00 each, worth $18,300 by the ad platforms' count.",
    );
  });

  it("names the period plainly", () => {
    expect(periodPhrase(sep, today)).toBe("In September");
    expect(periodPhrase({ from: "2026-10-01", to: "2026-10-25" }, today)).toBe("So far in October");
    expect(periodPhrase({ from: "2026-09-17", to: "2026-10-16" }, today)).toBe("From Sep 17 to Oct 16");
    expect(periodPhrase({ from: "2025-09-01", to: "2025-09-30" }, today)).toBe("In September 2025");
  });
});

const pacing = (o: Partial<Parameters<typeof budgetTile>[0] & object> = {}) => ({
  status: "ON_TARGET" as const, forecastStatus: "ON_TARGET" as const, phase: "ACTIVE" as const,
  budgetMinor: 600_000, actualToDateMinor: 514_100, projectedMinor: 603_000, remainingBudgetMinor: 85_900, ...o,
});

describe("budget wording", () => {
  it("says on track, or how far over or under (estimate)", () => {
    expect(budgetTile(null, "USD").value).toBe("No budget set");
    expect(budgetTile(pacing(), "USD")).toEqual({ value: "On track", short: "On track", detail: "$5,141 of $6,000 spent", tone: "good" });
    expect(budgetTile(pacing({ forecastStatus: "SLIGHTLY_OVER", projectedMinor: 637_500 }), "USD").value).toBe("About $375 over (estimate)");
  });

  it("writes the pacing headline for everyone", () => {
    expect(pacingHeadline(pacing({ forecastStatus: "SLIGHTLY_OVER", projectedMinor: 637_500 }), "USD", "October")).toBe(
      "You've spent $5,141 of $6,000 so far. At this rate October ends around $6,375, about $375 over budget (estimate).",
    );
    expect(pacingHeadline(pacing(), "USD", "October")).toContain("close to budget (estimate)");
  });

  it("puts a budget forecast problem first among up to three attention lines", () => {
    const lines = attentionLines(pacing({ status: "ON_TARGET", forecastStatus: "OVERSPENDING", projectedMinor: 720_000 }), ["a", "b", "c"], "USD", "October");
    expect(lines).toEqual(["Budget: at this rate October ends about $1,200 over budget (estimate).", "a", "b"]);
    expect(attentionLines(pacing(), [], "USD", "October")).toEqual([]);
  });

  it("badges the worse of spend so far and the forecast", () => {
    expect(displayPacingStatus({ status: "ON_TARGET", forecastStatus: "OVERSPENDING" })).toEqual({ status: "OVERSPENDING", label: "Overspending", forecastNote: "On plan so far, but forecast to finish well over budget." });
    expect(displayPacingStatus({ status: "UNDERSPENDING", forecastStatus: "SLIGHTLY_UNDER" })).toEqual({ status: "UNDERSPENDING", label: "Underspending", forecastNote: null });
  });
});
