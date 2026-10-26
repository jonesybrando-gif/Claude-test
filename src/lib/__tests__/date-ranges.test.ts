import { describe, expect, it } from "vitest";
import { comparisonRange, rangeLabel, resolveRange } from "../date-ranges";

describe("date ranges", () => {
  it("month to date ends yesterday", () => {
    expect(resolveRange("mtd", "2026-10-17")).toEqual({ from: "2026-10-01", to: "2026-10-16" });
    // on the 1st there are no complete days yet, so it shows last month and says so
    const first = resolveRange("mtd", "2026-10-01");
    expect(first).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(rangeLabel("mtd", first)).toMatch(/^Month to date \(showing last month/);
    expect(rangeLabel("mtd", resolveRange("mtd", "2026-10-17"))).toBe("Month to date");
    expect(rangeLabel("last_month", first)).toBe("Last month");
  });

  it("last month", () => {
    expect(resolveRange("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(resolveRange("last_month", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("rolling windows", () => {
    expect(resolveRange("last_7", "2026-10-17")).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(resolveRange("last_30", "2026-10-17")).toEqual({ from: "2026-09-17", to: "2026-10-16" });
  });

  it("custom ranges are ordered and validated", () => {
    expect(resolveRange("custom", "2026-10-17", { from: "2026-10-10", to: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(() => resolveRange("custom", "2026-10-17", { from: "bad", to: "2026-10-01" })).toThrow();
  });

  it("comparison ranges", () => {
    expect(comparisonRange({ from: "2026-10-01", to: "2026-10-16" }, "previous_month")).toEqual({ from: "2026-09-01", to: "2026-09-16" });
    expect(comparisonRange({ from: "2026-03-01", to: "2026-03-31" }, "previous_month")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(comparisonRange({ from: "2026-10-10", to: "2026-10-16" }, "previous_period")).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(comparisonRange({ from: "2026-10-10", to: "2026-10-16" }, "none")).toBeNull();
  });
});
