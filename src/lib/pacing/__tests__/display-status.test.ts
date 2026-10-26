import { describe, expect, it } from "vitest";
import { displayPacingStatus } from "../display-status";

describe("displayPacingStatus", () => {
  it("shows the to-date status when the forecast agrees", () => {
    expect(displayPacingStatus({ status: "ON_TARGET", forecastStatus: "ON_TARGET" })).toEqual({ status: "ON_TARGET", label: "On target", forecastNote: null });
  });
  it("uses the forecast when it is further from target, with a note", () => {
    const d = displayPacingStatus({ status: "ON_TARGET", forecastStatus: "UNDERSPENDING" });
    expect(d.status).toBe("UNDERSPENDING");
    expect(d.label).toBe("Underspending");
    expect(d.forecastNote).toBe("On plan so far, but forecast to finish well under budget.");
    expect(displayPacingStatus({ status: "SLIGHTLY_OVER", forecastStatus: "OVERSPENDING" }).forecastNote).toBe("Slightly over so far, but forecast to finish well over budget.");
  });
  it("keeps a worse to-date status over a milder forecast, and keeps ties", () => {
    expect(displayPacingStatus({ status: "OVERSPENDING", forecastStatus: "SLIGHTLY_OVER" }).status).toBe("OVERSPENDING");
    expect(displayPacingStatus({ status: "SLIGHTLY_UNDER", forecastStatus: "SLIGHTLY_OVER" }).status).toBe("SLIGHTLY_UNDER");
  });
  it("never lets a forecast replace not-started or no-budget", () => {
    expect(displayPacingStatus({ status: "NOT_STARTED", forecastStatus: "OVERSPENDING" }).status).toBe("NOT_STARTED");
    expect(displayPacingStatus({ status: "NO_BUDGET", forecastStatus: "UNDERSPENDING" }).status).toBe("NO_BUDGET");
  });
});
