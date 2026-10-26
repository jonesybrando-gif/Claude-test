import { formatMoney } from "./money";
import { STATUS_LABEL, type PacingStatus } from "./pacing/status";

/** How worried to be, shown as a dot colour. Words always carry the meaning; the dot only adds emphasis. */
export type StatusTone = "critical" | "watch" | "good" | "none";

/** Pacing states plus the two reasons a client can have no pacing at all. */
export type BudgetState = PacingStatus | "NOT_CONNECTED";

export interface BudgetStatusWords {
  /** Short on-screen words: "On track", "Over · +$123", "Under · −$962", "No budget"… */
  label: string;
  tone: StatusTone;
  /** The precise state for a tooltip and screen readers ("Slightly over"). */
  detail: string;
}

const WORD: Record<BudgetState, { word: string; tone: StatusTone }> = {
  ON_TARGET: { word: "On track", tone: "good" },
  SLIGHTLY_OVER: { word: "A bit over", tone: "watch" },
  // Red is kept for overspending; underspending is never red.
  OVERSPENDING: { word: "Over", tone: "critical" },
  SLIGHTLY_UNDER: { word: "A bit under", tone: "watch" },
  UNDERSPENDING: { word: "Under", tone: "watch" },
  NOT_STARTED: { word: "Not started", tone: "none" },
  NO_BUDGET: { word: "No budget", tone: "none" },
  NOT_CONNECTED: { word: "Not connected", tone: "none" },
};

/**
 * Plain budget status for people who don't manage ads: On track, A bit over,
 * Over, A bit under, Under, or a grey state, with the forecast amount when it
 * is known. The words, not only the dot colour, say how far off it is.
 * The seven pacing states and their thresholds are unchanged; only the words are.
 */
export function budgetStatusWords(state: BudgetState, projectedVarianceMinor?: number | null, currency = "USD"): BudgetStatusWords {
  const { word, tone } = WORD[state];
  const detail = state === "NOT_CONNECTED" ? "No ad account connected" : STATUS_LABEL[state];
  const over = word.toLowerCase().endsWith("over");
  const directional = over || word.toLowerCase().endsWith("under");
  // The amount only shows when it points the same way as the word (status can be "over so far" with a forecast under).
  const agrees = projectedVarianceMinor != null && (over ? projectedVarianceMinor > 0 : projectedVarianceMinor < 0);
  if (!directional || !agrees || projectedVarianceMinor == null) {
    return { label: word, tone, detail };
  }
  const amount = formatMoney(Math.abs(projectedVarianceMinor), currency, { whole: true });
  return { label: `${word} · ${projectedVarianceMinor > 0 ? "+" : "−"}${amount}`, tone, detail: `${detail}: forecast ${amount} ${projectedVarianceMinor > 0 ? "over" : "under"} budget` };
}
