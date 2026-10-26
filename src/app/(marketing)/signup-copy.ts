// One description of the early-access process, used by every form on the page
// so the hero, middle and final calls to action promise exactly the same thing.

/** What happens after someone submits their email. Shown under each form and in the success message. */
export const NEXT_STEP = "Next, we'll email you an invitation to book a setup call and connect your first client together.";

/** Shown beside every form. Accurate for every connection: the app only reads data. */
export const REASSURANCE = "We only read your data. We never change your campaigns, ads or budgets.";

/** Primary call-to-action labels under test. "benefit" is the default. */
export const CTA_LABELS = {
  benefit: "Get early access — see your own data",
  plain: "Get early access",
} as const;

export type CtaVariant = keyof typeof CTA_LABELS;

export const CTA_COOKIE = "mn_cta";

export function isCtaVariant(v: unknown): v is CtaVariant {
  return v === "benefit" || v === "plain";
}
