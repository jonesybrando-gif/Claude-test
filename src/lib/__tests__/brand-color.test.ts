import { describe, expect, it } from "vitest";
import { brandStyle, contrastRatio, inkFor } from "../brand-color";

describe("brand colour", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#4f46e5", "#ffffff")).toBeGreaterThan(6);
    expect(contrastRatio("#ffffff", "#4f46e5")).toBeCloseTo(contrastRatio("#4f46e5", "#ffffff"), 10);
  });

  it("picks white on dark brands and black on light ones", () => {
    expect(inkFor("#4f46e5")).toBe("#fff");
    expect(inkFor("#0b0b0b")).toBe("#fff");
    expect(inkFor("#fab219")).toBe("#000");
    expect(inkFor("#ffeb3b")).toBe("#000");
    expect(inkFor("#e8792b")).toBe("#000");
    expect(brandStyle("#ffffff")).toEqual({ "--brand": "#ffffff", "--brand-ink": "#000" });
  });
});
