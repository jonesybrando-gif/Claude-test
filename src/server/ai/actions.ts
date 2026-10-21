"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db";
import { requireClientEdit } from "../access";
import { loadClientReport } from "../client-report";
import { sendEmail, type SendResult } from "../email";
import { contextForReport } from "./context";
import { AI_MODEL, AiError, answerQuestion, draftClientEmail, draftReportSummary, EMAIL_PURPOSES, generateSuggestions, type EmailDraft, type EmailPurpose, type QaTurn } from "./assistant";
import { questionTools } from "./questions";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";

const fail = (e: unknown) => {
  if (e instanceof AiError) return { error: e.message };
  console.error("AI assistant error", e);
  return { error: "Something went wrong while drafting. Try again." };
};

async function reportFor(clientId: string, form?: FormData) {
  const get = (k: string) => (form?.get(k) ? String(form.get(k)) : undefined);
  const rep = await loadClientReport(clientId, { range: get("range"), compare: get("compare"), from: get("from"), to: get("to") });
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: rep.client.agencyId }, select: { name: true } });
  return { rep, agencyName: agency.name, data: contextForReport(rep) };
}

export type SuggestionsState = { ok?: string; error?: string } | undefined;

export async function generateSuggestionsAction(clientId: string, _prev: SuggestionsState, form: FormData): Promise<SuggestionsState> {
  const user = await requireClientEdit(clientId);
  try {
    const { rep, data } = await reportFor(clientId, form);
    const content = await generateSuggestions(data);
    await prisma.aiInsight.create({ data: { clientId, kind: "suggestions", content, model: AI_MODEL, rangeFrom: rep.range.from, rangeTo: rep.range.to, createdById: user.id } });
    revalidatePath(`/clients/${clientId}`);
    return { ok: "Suggestions updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function draftSummaryAction(clientId: string): Promise<{ summary?: string; error?: string }> {
  await requireClientEdit(clientId);
  try {
    const { data, agencyName } = await reportFor(clientId);
    return { summary: await draftReportSummary(data, { agencyName }) };
  } catch (e) {
    return fail(e);
  }
}

export type EmailDraftState = { draft?: EmailDraft; error?: string; n?: number } | undefined;

export async function draftEmailAction(clientId: string, prev: EmailDraftState, form: FormData): Promise<EmailDraftState> {
  const user = await requireClientEdit(clientId);
  const purpose = String(form.get("purpose") ?? "") as EmailPurpose;
  if (!(purpose in EMAIL_PURPOSES)) return { error: "Choose what the email is for." };
  const notes = String(form.get("notes") ?? "").slice(0, 2000);
  if (purpose === "custom" && !notes.trim()) return { error: "Describe what the email should cover in the notes." };
  try {
    const { data, agencyName } = await reportFor(clientId, form);
    const recipientName = String(form.get("recipientName") ?? "").trim() || null;
    const draft = await draftClientEmail(data, { purpose, notes, senderName: user.name, agencyName, recipientName });
    return { draft, n: (prev?.n ?? 0) + 1 };
  } catch (e) {
    return { ...fail(e), draft: prev?.draft, n: prev?.n };
  }
}

export type SendState = { ok?: string; error?: string } | undefined;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export async function sendClientEmailAction(clientId: string, _prev: SendState, form: FormData): Promise<SendState> {
  const user = await requireClientEdit(clientId);
  const to = [...new Set(String(form.get("to") ?? "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (to.length === 0) return { error: "Add at least one recipient." };
  if (to.length > 10) return { error: "Send to at most 10 recipients at a time." };
  const bad = to.filter((e) => !EMAIL_RE.test(e));
  if (bad.length) return { error: `Not a valid email address: ${bad.join(", ")}` };
  if (!subject || subject.length > 200) return { error: "Add a subject (up to 200 characters)." };
  if (!body || body.length > 20000) return { error: "The message is empty or too long." };
  const results: SendResult[] = [];
  for (const addr of to) {
    results.push(await sendEmail({ agencyId: user.agencyId, to: addr, subject, text: body, kind: "client_email", replyTo: user.email }));
  }
  revalidatePath("/settings/email");
  if (results.every((r) => r.status === "SENT")) return { ok: `Sent to ${to.join(", ")}.` };
  if (results.every((r) => r.status === "NOT_CONFIGURED")) return { error: "Email sending isn't configured (SMTP_URL, EMAIL_FROM). The message was saved to the Email log but not sent." };
  const failed = to.filter((_, i) => results[i].status !== "SENT");
  return { error: `Couldn't send to ${failed.join(", ")}. See Settings → Email log.` };
}

export type AskResult = { answer?: string; error?: string };

/** Answers one question about a client, using the page's date range. */
export async function askQuestionAction(clientId: string, query: Record<string, string | undefined>, question: string, history: QaTurn[]): Promise<AskResult> {
  await requireClientEdit(clientId);
  const q = question.trim();
  if (!q) return { error: "Type a question first." };
  if (q.length > 500) return { error: "Keep questions under 500 characters." };
  const turns = (Array.isArray(history) ? history : [])
    .slice(-4)
    .filter((t) => typeof t?.question === "string" && typeof t?.answer === "string")
    .map((t) => ({ question: t.question.slice(0, 500), answer: t.answer.slice(0, 4000) }));
  try {
    const rep = await loadClientReport(clientId, { range: query.range, compare: query.compare, from: query.from, to: query.to });
    const periodLabel = `${PRESET_LABEL[rep.preset].toLowerCase()} (${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })})`;
    return { answer: await answerQuestion(contextForReport(rep), q, turns, questionTools(rep), { periodLabel }) };
  } catch (e) {
    return fail(e);
  }
}
