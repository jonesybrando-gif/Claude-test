import { describe, expect, it } from "vitest";
import { lineResults, portfolioResults, resolveGoal, resultsFor, stillCounting } from "../results";
import { emptyTotals, type MetricTotals } from "../metrics";

const t = (o: Partial<MetricTotals>): MetricTotals => ({ ...emptyTotals(), ...o });
// Shapes from the adapters: Meta conversions already include its leads; LSA conversions are charged leads (a subset of leads).
const google = t({ costMinor: 300_000, clicks: 600, conversions: 20 });
const meta = t({ costMinor: 200_000, clicks: 900, conversions: 12, leads: 10, leadsReported: true });
const lsa = t({ costMinor: 100_000, conversions: 6, leads: 9, leadsReported: true, hasEstimatedCost: true });

describe("results", () => {
  it("never double counts leads and conversions", () => {
    expect(lineResults(meta)).toBe(12); // not 22
    expect(lineResults(lsa)).toBe(9); // every lead, not 6 charged + 9
    const r = resultsFor("LEADS", [google, meta, lsa]);
    expect(r.value).toBe(20 + 12 + 9);
    expect(r.costMinor).toBe(600_000);
    expect(r.costPerMinor).toBeCloseTo(600_000 / 41, 8);
    expect(r).toMatchObject({ goal: "LEADS", guessed: false, label: "Leads", singular: "lead" });
  });

  it("uses each goal's own name, and clicks for awareness", () => {
    expect(resultsFor("CALLS", google).label).toBe("Calls");
    expect(resultsFor("BOOKINGS", google).singular).toBe("booking");
    const aw = resultsFor("AWARENESS", [google, meta]);
    expect(aw).toMatchObject({ label: "Clicks", value: 1500 });
    expect(aw.costPerMinor).toBeCloseTo(500_000 / 1500, 8);
  });

  it("reports sales value only when real values are tracked", () => {
    const shop = t({ costMinor: 100_000, conversions: 40, conversionValueMinor: 1_200_000 });
    expect(resultsFor("SALES", shop).valueMinor).toBe(1_200_000);
    // $1 per conversion is the platform default, not revenue.
    expect(resultsFor("SALES", t({ costMinor: 100_000, conversions: 40, conversionValueMinor: 4_000 })).valueMinor).toBeUndefined();
  });

  it("guesses a goal from the data when none is set", () => {
    expect(resolveGoal(null, t({ conversions: 40, conversionValueMinor: 1_200_000 }))).toEqual({ goal: "SALES", guessed: true });
    expect(resolveGoal(null, t({ conversions: 40, conversionValueMinor: 4_000 })).goal).toBe("LEADS");
    expect(resolveGoal(null, t({ clicks: 50 })).goal).toBe("AWARENESS");
    // Either period counts: a quiet month doesn't flip the goal.
    expect(resolveGoal(null, t({ clicks: 50 }), t({ conversions: 3 })).goal).toBe("LEADS");
    expect(resolveGoal("CALLS", t({ clicks: 50 }))).toEqual({ goal: "CALLS", guessed: false });
    // A guessed goal is called "Results"; awareness stays "Clicks".
    expect(resultsFor(null, google)).toMatchObject({ goal: "LEADS", guessed: true, label: "Results", singular: "result" });
    expect(resultsFor(null, t({ clicks: 50 })).label).toBe("Clicks");
  });

  it("sums across clients for the agency Home", () => {
    const a = resultsFor("LEADS", google);
    const b = resultsFor("LEADS", meta);
    expect(portfolioResults([a, b])).toMatchObject({ label: "Leads", value: 32, costMinor: 500_000 });
    const mixed = portfolioResults([a, resultsFor("SALES", google), resultsFor("AWARENESS", meta)]);
    expect(mixed).toMatchObject({ label: "Results", value: 40, costMinor: 600_000 });
  });

  it("treats the last 14 days as still counting", () => {
    expect(stillCounting("2026-10-25", "2026-10-26")).toBe(true);
    expect(stillCounting("2026-10-12", "2026-10-26")).toBe(true);
    expect(stillCounting("2026-10-11", "2026-10-26")).toBe(false);
  });
});
