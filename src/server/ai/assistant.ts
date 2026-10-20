import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";

// The AI assistant drafts text from report data. It never acts on ad
// platforms; everything it writes is shown to a person to review first.

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function aiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function setAiClientForTests(c: Anthropic | null) {
  client = c;
}
function getClient(): Anthropic {
  return (client ??= new Anthropic());
}

/** An error whose message is safe and useful to show in the UI. */
export class AiError extends Error {}

const BASE_RULES = `You are an analyst at a digital advertising agency, working from the agency's reporting data.

Rules:
- Use only the figures in the DATA block. Never invent numbers, benchmarks, industry averages, or causes. If something can't be judged from the data, say what's missing instead of guessing.
- Quote figures exactly as written in the data; don't recompute them.
- Conversions are platform-reported; don't present them as verified sales.
- "not reported" means the platforms didn't report it, not that it was zero.
- If the data is marked as demo data, say so plainly wherever results are described.
- Nobody has changed anything in the ad platforms. Never claim that a change was made; recommend changes for a person to make.
- Write plain text without Markdown headings, tables or bold.`;

async function generate<T extends z.ZodType>(schema: T, task: string, data: string, effort: "low" | "medium" | "high" = "medium"): Promise<z.infer<T>> {
  if (!aiConfigured() && !client) throw new AiError("The AI assistant isn't set up. Add ANTHROPIC_API_KEY to the server environment.");
  let res;
  try {
    res = await getClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: BASE_RULES,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: `<DATA>\n${data}\n</DATA>\n\n${task}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("The Anthropic API key doesn't have access to this model.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI service is busy or the usage limit was reached. Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("Couldn't reach the AI service. Check the server's network access.");
    if (e instanceof Anthropic.APIError) throw new AiError(`The AI service returned an error (${e.status ?? "unknown"}). Try again.`);
    // The SDK throws while parsing when the JSON is incomplete (e.g. the reply hit max_tokens).
    if (e instanceof Anthropic.AnthropicError) throw new AiError("The AI response was cut off or couldn't be read. Try again.");
    throw e;
  }
  if (res.stop_reason === "refusal") throw new AiError("The AI declined this request. Try rewording your notes.");
  if (res.stop_reason === "max_tokens") throw new AiError("The AI response was cut off. Try again with shorter notes.");
  if (!res.parsed_output) throw new AiError("The AI response couldn't be read. Try again.");
  return res.parsed_output;
}

// --- Suggestions ------------------------------------------------------------

export const SuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().describe("Short imperative, e.g. 'Shift budget from X to Y'"),
      priority: z.enum(["high", "medium", "low"]),
      category: z.enum(["budget", "performance", "tracking", "data"]),
      detail: z.string().describe("Two to four sentences: what to do and why"),
      evidence: z.string().describe("The specific figures from the data that support this"),
    }),
  ),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;

export async function generateSuggestions(data: string): Promise<Suggestions> {
  const out = await generate(
    SuggestionsSchema,
    `Review this client's advertising data and give the account manager up to 6 proactive, specific recommendations, most important first.
Look for: budget pacing risks and how much to change daily spend; campaigns or platforms whose cost per result is clearly worse or better than the rest; meaningful changes against the comparison period; tracking gaps (spend with no conversions or leads); stale or estimated data that limits conclusions.
Each recommendation must cite the figures it rests on in "evidence". Skip anything the data doesn't support. If nothing needs attention, return one low-priority suggestion saying so.`,
    data,
    "high",
  );
  return { suggestions: out.suggestions.slice(0, 6) };
}

// --- Report summary ---------------------------------------------------------

const SummarySchema = z.object({ summary: z.string() });

export async function draftReportSummary(data: string, opts: { agencyName: string }): Promise<string> {
  const out = await generate(
    SummarySchema,
    `Write the written summary that opens this client's performance report, from ${opts.agencyName} to the client.
80 to 150 words, two short paragraphs, friendly and plain-spoken. Lead with the most important results versus the comparison period, then budget pacing, then one or two next steps the agency recommends. Avoid jargon; spell out abbreviations once.`,
    data,
  );
  return out.summary.trim();
}

// --- Executive summary ------------------------------------------------------

const ExecSummarySchema = z.object({
  overview: z.string().describe("The headline paragraphs, separated by a blank line"),
  working: z.array(z.string()).describe("What's working: one specific finding per item, each citing its figures"),
  notWorking: z.array(z.string()).describe("What isn't working or needs attention: one specific finding per item, each citing its figures"),
  recommendations: z.array(z.string()).describe("Strategic recommendations, most important first: what to do, where, and why, citing the figures"),
});
export type ExecSummaryDraft = z.infer<typeof ExecSummarySchema>;

export async function draftExecutiveSummary(data: string, opts: { agencyName: string; days: number }): Promise<ExecSummaryDraft> {
  const short = opts.days <= 10;
  const out = await generate(
    ExecSummarySchema,
    `Write the executive summary at the top of this client's report, from ${opts.agencyName} to the client, covering exactly the reporting period in the data. It should read like a strategist's analysis, not a list of numbers.

overview: ${short ? "one paragraph of 60 to 100 words" : "two paragraphs, 120 to 200 words in total"}. Lead with the headline results and how they compare with the comparison period, then what drove them (which platforms and campaigns) and the budget position if the data covers it.
working: ${short ? "2 to 3" : "3 to 5"} findings about what is performing well and why it matters: campaigns or platforms with a clearly lower cost per result than the account average, improvements against the comparison period, efficient use of budget. Compare each one with the average or the previous period using figures in the data.
notWorking: ${short ? "2 to 3" : "3 to 5"} findings about what is underperforming or at risk: spend with few or no conversions or leads, campaigns whose cost per result is well above average or rising, falling click-through or conversion rates, budget pacing problems, tracking or data gaps. Be direct but not alarmist.
recommendations: ${short ? "3 to 4" : "4 to 6"} strategic recommendations, most important first. Each one names the campaign, platform or setting, says what to change (for example move budget from one campaign to another, tighten targeting, refresh creative, fix landing pages or conversion tracking, adjust daily spend to land on budget) and gives the figures that justify it. Recommend only what the data supports, and say when a test is needed before committing.

If there aren't enough results to judge something, say so in the relevant list rather than inventing a finding. Write to the client ("your ads" is fine), without greetings or a sign-off. Each list item is one or two sentences of plain text with no leading bullet or number.`,
    data,
    "medium",
  );
  const clean = (xs: string[]) => xs.map((x) => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  return { overview: out.overview.trim(), working: clean(out.working), notWorking: clean(out.notWorking), recommendations: clean(out.recommendations) };
}

// --- Client email -----------------------------------------------------------

export const EMAIL_PURPOSES = {
  monthly_update: "Monthly performance update",
  pacing_update: "Budget pacing update",
  results_highlight: "Highlight a strong result",
  custom: "Something else (describe in notes)",
} as const;
export type EmailPurpose = keyof typeof EMAIL_PURPOSES;

const EmailSchema = z.object({ subject: z.string(), body: z.string() });
export type EmailDraft = z.infer<typeof EmailSchema>;

export async function draftClientEmail(
  data: string,
  opts: { purpose: EmailPurpose; notes: string; senderName: string; agencyName: string; recipientName: string | null },
): Promise<EmailDraft> {
  const out = await generate(
    EmailSchema,
    `Draft an email from ${opts.senderName} at ${opts.agencyName} to the client${opts.recipientName ? ` (${opts.recipientName})` : ""}.
Purpose: ${EMAIL_PURPOSES[opts.purpose]}.
${opts.notes.trim() ? `Notes from ${opts.senderName} (follow them; they take priority over your own emphasis, but don't state figures that aren't in the data):\n<NOTES>\n${opts.notes.trim()}\n</NOTES>\n` : ""}
Keep it under 200 words, warm and professional, with short paragraphs and at most one short list. Use only figures from the data. End with a clear next step and sign off as ${opts.senderName}. Return a subject line and a plain-text body.`,
    data,
  );
  return { subject: out.subject.trim().slice(0, 200), body: out.body.trim() };
}
