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

// Past-tense verbs agencies use for finished work. Irregular ones that are also
// everyday imperatives ("Set a cap", "Cut spend", "Split test") only count after a subject.
const IRREGULAR_DONE = ["did", "made", "built", "ran", "sent", "wrote", "took", "gave", "rebuilt", "began", "chose", "found", "got", "kept", "led", "left", "lost", "met", "paid", "shut", "spent", "upped"];
const AMBIGUOUS = ["set", "put", "cut", "split", "reset", "shut"];
const NOT_PAST = new Set(["need", "feed", "seed", "speed", "proceed", "exceed", "succeed", "bed", "red", "shed"]);
// "-ed" words that usually start a noun phrase in a plan ("Targeted ads for…").
const ADJECTIVES = new Set(["targeted", "automated", "advanced", "dedicated", "detailed", "limited", "branded", "sponsored", "tailored", "focused", "related", "combined", "scheduled", "extended", "localized", "personalized", "customized", "updated", "improved", "expanded", "refined", "streamlined"]);
const SUBJECT = /^(we|i|our team|the team|your team|catalyst|[a-z]+ team)\b/;

const isPastVerb = (w: string | undefined, afterSubject: boolean): boolean => {
  if (!w) return false;
  if (IRREGULAR_DONE.includes(w)) return true;
  if (AMBIGUOUS.includes(w)) return afterSubject;
  if (w.length > 3 && w.endsWith("ed") && !NOT_PAST.has(w)) return afterSubject || !ADJECTIVES.has(w);
  return false;
};

const PLAN_START = /^(we'll|we will|we're|we are|we plan|we'd|we would|we recommend|we suggest|we want|we need|we intend|we're going to|next,? we|plan to|planning to|to )/;
const norm = (text: string) => text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/^[-•*\d.)\s]+/, "");

/** True when a step is worded as something still to come ("We'll…", "We plan to…"). */
export function readsAsPlan(text: string): boolean {
  return PLAN_START.test(norm(text));
}

/**
 * True when a step reads as already finished, e.g. "We added Saturday hours",
 * "We've paused Display", "Budget has been moved" or "Paused the display
 * campaign". Plans ("We'll add", "We plan to pause", "Set a $50 cap",
 * "Targeted ads for implants") return false.
 */
export function claimsDone(text: string): boolean {
  const t = norm(text);
  if (PLAN_START.test(t)) return false;
  // Passive or perfect anywhere: "has been moved", "were added", "is now paused", "is live".
  if (/\b(has|have|had) been \w+ed\b|\b(was|were) \w+ed\b|\bis now (\w+ed|live|running|fixed|done)\b|\b(is|are) (now )?(complete|completed|done|finished|live)\b/.test(t)) return true;
  // "We've added…", "I've updated…", "We have paused…" (but not "we have to…").
  const perfect = t.match(/^(we|i|our team|the team)('ve| have| has)\s+(already\s+|just\s+)?([a-z]+)/);
  if (perfect) return perfect[4] !== "to" && isPastVerb(perfect[4], true);
  const subj = t.match(SUBJECT);
  const rest = subj ? t.slice(subj[0].length).trim().replace(/^(already|just|also|then)\s+/, "") : t;
  return isPastVerb(rest.split(/[^a-z']+/).filter(Boolean)[0], !!subj);
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
