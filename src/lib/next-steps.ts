// Next steps the agency shows a client, and what happened to each AI
// recommendation. Pure: no database access.
//
// Rules:
//   - AI only drafts. A draft (or anything AI-written) never reaches a client
//     until a person approves it, which makes it "Planned".
//   - Only a person marks a step "Done", with the date it happened.
//   - Wording that says the work is finished ("We added…") can't be approved as
//     a plan: it must be reworded or marked done.

export type NextStepStatus = "DRAFT" | "PLANNED" | "DONE";
export type InsightState = "NEW" | "REVIEWED" | "PLANNED" | "DONE" | "DISMISSED";

export const INSIGHT_STATES: InsightState[] = ["NEW", "REVIEWED", "PLANNED", "DONE", "DISMISSED"];
export const isInsightState = (v: unknown): v is InsightState => typeof v === "string" && (INSIGHT_STATES as string[]).includes(v);

/** Matches a recommendation across regenerations: case, punctuation and spacing don't matter. */
export function insightFingerprint(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9$%]+/g, " ")
    .trim()
    .slice(0, 160);
}

// Past-tense verbs agencies use for finished work. Regular "-ed" verbs are matched by the pattern below.
const IRREGULAR_DONE = ["did", "made", "set", "put", "built", "ran", "sent", "wrote", "took", "gave", "cut", "rebuilt", "began", "chose", "found", "got", "kept", "led", "left", "lost", "met", "paid", "shut", "split", "spent", "upped"];
const NOT_PAST = new Set(["need", "feed", "seed", "speed", "proceed", "exceed", "succeed", "bed", "red", "shed"]);

/**
 * True when a step reads as already finished, e.g. "We added Saturday hours" or
 * "Paused the display campaign". Future or planning wording ("We'll add",
 * "We plan to pause", "We're reviewing") returns false.
 */
export function claimsDone(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/^[-•*\d.)\s]+/, "");
  if (/^(we('|’)ll|we will|we('|’)re|we are|we plan|we('|’)d|we would|we recommend|we suggest|next,? we|plan to|planning to|to )/.test(t)) return false;
  const words = t.replace(/^(we|i|our team|the team|catalyst|[a-z]+ team)\s+(have\s+|has\s+|already\s+|just\s+)*/, "").split(/[^a-z']+/).filter(Boolean);
  const verb = words[0];
  if (!verb) return false;
  if (/^(we|i)\s+(have|has|already|just)\s/.test(t)) return true;
  if (IRREGULAR_DONE.includes(verb)) return true;
  return verb.length > 3 && verb.endsWith("ed") && !NOT_PAST.has(verb);
}

export interface NextStepLike {
  status: string;
  doneOn: string | null;
}

/** Steps a client sees: planned ones, and done ones from the last `doneDays` days. Drafts never. */
export function clientVisibleSteps<T extends NextStepLike>(steps: T[], today: string, doneDays = 45): T[] {
  const cutoff = new Date(Date.parse(today) - doneDays * 86_400_000).toISOString().slice(0, 10);
  return steps.filter((s) => s.status === "PLANNED" || (s.status === "DONE" && !!s.doneOn && s.doneOn >= cutoff));
}

/** A first draft for a client-facing step, from an internal recommendation title. Always a plan, never a claim. */
export function draftFromRecommendation(title: string): string {
  const t = title.trim().replace(/[.\s]+$/, "");
  if (!t) return "";
  return `We plan to ${t.charAt(0).toLowerCase()}${t.slice(1)}.`;
}
