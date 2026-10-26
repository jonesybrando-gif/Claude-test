import { describe, expect, it } from "vitest";
import { summaryLines, type SummaryRow } from "../daily-summary";

const NOW = new Date("2026-10-19T12:00:00Z");
const row = (o: Partial<SummaryRow> = {}): SummaryRow => ({
  clientId: "c1",
  clientName: "ABC Plumbing",
  stale: false,
  disconnected: false,
  lastSuccessfulSyncAt: new Date(NOW.getTime() - 3600_000).toISOString(),
  result: { status: "ON_TARGET", forecastStatus: "ON_TARGET" },
  action: { severity: "ok", headline: "On target", detail: "No action required." },
  ...o,
});

describe("daily summary lines (L5)", () => {
  it("stale but on-target lines don't need action; they get an age note", () => {
    const stale = row({ stale: true, lastSuccessfulSyncAt: new Date(NOW.getTime() - 40 * 3600_000).toISOString(), action: { severity: "warning", headline: "On target", detail: "No action required. Data is stale — confirm in the ad platform before acting." } });
    const s = summaryLines([stale, row()], new Map(), NOW);
    expect(s.needAction).toEqual([]);
    expect(s.onTarget).toBe(1);
    expect(s.staleOnTarget[0].detail).toBe("Data is 40 hours old — confirm before acting.");
  });
  it("stale off-target lines still need action, with the age note", () => {
    const s = summaryLines([row({ stale: true, lastSuccessfulSyncAt: new Date(NOW.getTime() - 30 * 3600_000).toISOString(), result: { status: "UNDERSPENDING", forecastStatus: "UNDERSPENDING" }, action: { severity: "critical", headline: "Projected to underspend by $900", detail: "Increase spend. Data is stale — confirm in the ad platform before acting." } })], new Map(), NOW);
    expect(s.needAction).toHaveLength(1);
    expect(s.needAction[0].detail).toBe("Increase spend. Data is 30 hours old — confirm before acting.");
  });
  it("lists critical before warning and skips muted pacing types", () => {
    const warn = row({ clientName: "W", result: { status: "SLIGHTLY_OVER", forecastStatus: "SLIGHTLY_OVER" }, action: { severity: "warning", headline: "w", detail: "w" } });
    const crit = row({ clientName: "C", result: { status: "OVERSPENDING", forecastStatus: "OVERSPENDING" }, action: { severity: "critical", headline: "c", detail: "c" } });
    expect(summaryLines([warn, crit], new Map(), NOW).needAction.map((l) => l.client)).toEqual(["C", "W"]);
    expect(summaryLines([warn, crit], new Map([["c1", ["OVERSPENDING"]]]), NOW).needAction).toEqual([]);
  });
});
