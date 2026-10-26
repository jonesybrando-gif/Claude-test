import { describe, expect, it } from "vitest";
import { budgetStatusWords } from "../budget-status";

describe("budgetStatusWords", () => {
  it("uses three plain words plus grey states", () => {
    expect(budgetStatusWords("ON_TARGET").label).toBe("On track");
    expect(budgetStatusWords("SLIGHTLY_OVER").label).toBe("Over");
    expect(budgetStatusWords("UNDERSPENDING").label).toBe("Under");
    expect(budgetStatusWords("NO_BUDGET")).toMatchObject({ label: "No budget", tone: "none" });
    expect(budgetStatusWords("NOT_CONNECTED")).toMatchObject({ label: "Not connected", tone: "none" });
    expect(budgetStatusWords("NOT_STARTED").tone).toBe("none");
  });

  it("adds the forecast amount when it points the same way", () => {
    expect(budgetStatusWords("SLIGHTLY_OVER", 12_300).label).toBe("Over · +$123");
    expect(budgetStatusWords("UNDERSPENDING", -96_200).label).toBe("Under · −$962");
    // Over so far but forecast under: no contradictory amount.
    expect(budgetStatusWords("SLIGHTLY_OVER", -5_000).label).toBe("Over");
    expect(budgetStatusWords("ON_TARGET", 1_200).label).toBe("On track");
  });

  it("keeps red for overspending only", () => {
    expect(budgetStatusWords("OVERSPENDING").tone).toBe("critical");
    expect(budgetStatusWords("SLIGHTLY_OVER").tone).toBe("watch");
    expect(budgetStatusWords("UNDERSPENDING").tone).toBe("watch");
    expect(budgetStatusWords("ON_TARGET").tone).toBe("good");
  });

  it("keeps the precise state for tooltips", () => {
    expect(budgetStatusWords("SLIGHTLY_UNDER").detail).toBe("Slightly under");
    expect(budgetStatusWords("UNDERSPENDING", -96_200).detail).toBe("Underspending: forecast $962 under budget");
  });
});
