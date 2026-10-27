import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./db";

export interface OutgoingEmail {
  agencyId?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: "invite" | "password_reset" | "alert" | "daily_summary" | "client_email" | "scheduled_report" | "note_mention" | "lead";
  /** Replies go here instead of EMAIL_FROM (e.g. the account manager). */
  replyTo?: string;
  /**
   * Strings (e.g. one-time links) to replace with "[link removed]" in the
   * stored copy, so secrets never sit in the database.
   */
  redact?: string[];
  /** Files to attach (e.g. a report PDF). Not stored in the outbox copy. */
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface SendResult {
  status: "SENT" | "FAILED" | "NOT_CONFIGURED";
  error?: string;
}

let cached: Transporter | null | undefined;

/**
 * Resend API key, when email goes through Resend. Sent over HTTPS rather than
 * SMTP because hosts such as Railway block outbound SMTP on most plans.
 * Taken from RESEND_API_KEY, or from an SMTP_URL that points at smtp.resend.com.
 */
export function resendApiKey(env: Record<string, string | undefined> = process.env): string | null {
  if (env.RESEND_API_KEY) return env.RESEND_API_KEY;
  if (!env.SMTP_URL) return null;
  try {
    const u = new URL(env.SMTP_URL);
    return u.hostname === "smtp.resend.com" && u.password ? decodeURIComponent(u.password) : null;
  } catch {
    return null;
  }
}

/** SMTP transport from SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465), or null when not configured. */
function transport(): Transporter | null {
  if (cached !== undefined) return cached;
  cached = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return cached;
}

export function emailConfigured(): boolean {
  return (!!process.env.SMTP_URL || !!process.env.RESEND_API_KEY) && !!process.env.EMAIL_FROM;
}

async function sendViaResend(key: string, msg: OutgoingEmail, from: string): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      ...(msg.attachments?.length
        ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), content_type: a.contentType })) }
        : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { status: "SENT" };
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return { status: "FAILED", error: `Resend ${res.status}: ${body?.message ?? res.statusText}`.slice(0, 500) };
}

/** Test hook */
export function setTransportForTests(t: Transporter | null) {
  cached = t;
}

/** Sends an email (through Resend or SMTP, when configured) and always records it in the outbox. */
export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const key = cached === undefined ? resendApiKey() : null; // a test transport takes precedence
  const t = key ? null : transport();
  let result: SendResult;
  if ((!key && !t) || !process.env.EMAIL_FROM) {
    result = { status: "NOT_CONFIGURED" };
  } else if (key) {
    try {
      result = await sendViaResend(key, msg, process.env.EMAIL_FROM);
    } catch (e) {
      result = { status: "FAILED", error: (e as Error).message.slice(0, 500) };
    }
  } else {
    try {
      await t!.sendMail({ from: process.env.EMAIL_FROM, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html, attachments: msg.attachments });
      result = { status: "SENT" };
    } catch (e) {
      result = { status: "FAILED", error: (e as Error).message.slice(0, 500) };
    }
  }
  const scrub = (s: string | undefined) => (s === undefined ? s : (msg.redact ?? []).reduce((acc, r) => acc.split(r).join("[link removed]"), s));
  await prisma.emailMessage.create({
    data: { agencyId: msg.agencyId ?? null, to: msg.to, subject: msg.subject, text: scrub(msg.text)! + (msg.attachments?.length ? `\n\n[Attached: ${msg.attachments.map((a) => a.filename).join(", ")}]` : ""), html: scrub(msg.html) ?? null, kind: msg.kind, status: result.status, error: result.error ?? null },
  });
  return result;
}

export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}
