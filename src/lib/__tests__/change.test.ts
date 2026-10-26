import { describe, expect, it } from "vitest";
import { changeVerdict, changeWords } from "../change";

describe("change verdicts", () => {
  it("calls a clear change better or worse by direction", () => {
    expect(changeVerdict({ changePct: 8, better: "up" })).toEqual({ verdict: "better", tone: "good" });
    expect(changeVerdict({ changePct: 8, better: "down" })).toEqual({ verdict: "worse", tone: "bad" });
    expect(changeVerdict({ changePct: -12, better: "down" })).toEqual({ verdict: "better", tone: "good" });
  });

  it("gives spend and other neutral metrics no verdict", () => {
    expect(changeVerdict({ changePct: 30, better: "neutral" })).toEqual({ verdict: "neutral", tone: "neutral" });
  });

  it("treats changes under 5% as about the same", () => {
    expect(changeVerdict({ changePct: 4.9, better: "up" }).verdict).toBe("same");
    expect(changeVerdict({ changePct: -4.9, better: "down" }).verdict).toBe("same");
    expect(changeVerdict({ changePct: 5, better: "up" }).verdict).toBe("better");
  });

  it("says too few to compare when either period has under 10", () => {
    expect(changeVerdict({ changePct: 50, better: "up", sample: { current: 9, previous: 40 } })).toEqual({ verdict: "few", tone: "neutral" });
    expect(changeVerdict({ changePct: 50, better: "up", sample: { current: 40, previous: 9 } }).verdict).toBe("few");
    expect(changeVerdict({ changePct: 50, better: "up", sample: { current: 10, previous: 10 } }).verdict).toBe("better");
  });

  it("holds result verdicts while results are still being counted", () => {
    expect(changeVerdict({ changePct: -30, better: "up", sample: { current: 40, previous: 60 }, stillCounting: true })).toEqual({ verdict: "counting", tone: "neutral" });
  });

  it("has no verdict without a comparison", () => {
    expect(changeVerdict({ changePct: null, better: "up" })).toEqual({ verdict: null, tone: null });
  });

  it("writes the change in words, with the full sentence for screen readers", () => {
    expect(changeWords("better", 8.2, "$5,790", "Leads")).toEqual({ text: "Up 8% from $5,790 · better", aria: "Leads: up 8% from $5,790, which is better." });
    expect(changeWords("worse", -12, "48", "Leads").text).toBe("Down 12% from 48 · worse");
    expect(changeWords("neutral", 8, "$5,790", "Ad spend")).toEqual({ text: "Up 8% from $5,790", aria: "Ad spend: up 8% from $5,790, neither good nor bad on its own." });
    expect(changeWords("same", 2, "$5,790", "Ad spend").text).toBe("About the same as $5,790");
    expect(changeWords("few", 50, "4", "Leads").text).toBe("Too few to compare (was 4)");
    expect(changeWords("counting", -20, "50", "Leads").text).toBe("Down 20% from 50 · still counting");
  });
});
