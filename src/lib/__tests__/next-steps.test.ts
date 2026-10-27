import { describe, expect, it } from "vitest";
import { claimsDone, readsAsPlan, clientVisibleSteps, draftFromRecommendation, insightFingerprint } from "../next-steps";

describe("claimsDone", () => {
  it("flags wording that says the work is finished", () => {
    for (const t of ["We added your Saturday hours to your Google ads.", "Paused the display campaign", "We moved $300 into search", "We have updated the landing page", "Built a new campaign for implants", "We set up call tracking", "We've paused Display", "We’ve added Saturday hours", "I've updated the page", "Budget has been moved to search", "Saturday hours were added", "The campaign is now paused", "We cut Display spend by 20%"]) {
      expect(claimsDone(t), t).toBe(true);
    }
  });
  it("accepts plans", () => {
    for (const t of ["We'll move about $300 into your best Google ads.", "We plan to review the emergency dentist page.", "We're reviewing your page", "Review the search terms", "We recommend a two-week test", "Next, we will add Saturday hours", "Need to check tracking", "Split test two headlines", "Cut Display spend by 20%", "Set a $50 daily cap", "Targeted ads for implant searches", "Automated bidding test on brand terms", "We have to pause Display first", "We’ll add Saturday hours"]) {
      expect(claimsDone(t), t).toBe(false);
    }
  });
});

describe("readsAsPlan", () => {
  it("spots future wording", () => {
    expect(readsAsPlan("We’ll move budget")).toBe(true);
    expect(readsAsPlan("We plan to test")).toBe(true);
    expect(readsAsPlan("Moved $300 into search")).toBe(false);
  });
});

describe("clientVisibleSteps", () => {
  it("shows planned and recently done steps, never drafts", () => {
    const steps = [
      { id: "a", status: "DRAFT", doneOn: null },
      { id: "b", status: "PLANNED", doneOn: null },
      { id: "c", status: "DONE", doneOn: "2026-10-20" },
      { id: "d", status: "DONE", doneOn: "2026-08-01" },
    ];
    expect(clientVisibleSteps(steps, "2026-10-27").map((s) => s.id)).toEqual(["b", "c"]);
  });
});

describe("fingerprints and drafts", () => {
  it("matches the same recommendation across rewrites of case and punctuation", () => {
    expect(insightFingerprint("Shift budget to Search!")).toBe(insightFingerprint("shift  budget to search"));
  });
  it("drafts a plan, never a claim", () => {
    const d = draftFromRecommendation("Shift $300 from Display to Search");
    expect(d).toBe("We plan to shift $300 from Display to Search.");
    expect(claimsDone(d)).toBe(false);
  });
});
