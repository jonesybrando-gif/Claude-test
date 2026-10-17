import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./db";

export interface OutgoingEmail {
  agencyId?: string | null;
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: "invite" | "password_reset" | "alert" | "daily_summary" | "client_email";
  /** Replies go here instead of EMAIL_FROM (e.g. the account manager). */
  replyTo?: string;
  /**
   * Strings (e.g. one-time links) to replace with "[link removed]" in the
   * stored copy, so secrets never sit in the database.
   */
  redact?: string[];
}

export interface SendResult {
  status: "SENT" | "FAILED" | "NOT_CONFIGURED";
  error?: string;
}

let cached: Transporter | null | undefined;

/** SMTP transport from SMTP_URL (e.g. smtps://user:pass@smtp.example.com:465), or null when not configured. */
function transport(): Transporter | null {
  if (cached !== undefined) return cached;
  cached = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return cached;
}

export function emailConfigured(): boolean {
  return !!process.env.SMTP_URL && !!process.env.EMAIL_FROM;
}

/** Test hook */
export function setTransportForTests(t: Transporter | null) {
  cached = t;
}

/** Sends an email (when SMTP is configured) and always records it in the outbox. */
export async function sendEmail(msg: OutgoingEmail): Promise<SendResult> {
  const t = transport();
  let result: SendResult;
  if (!t || !process.env.EMAIL_FROM) {
    result = { status: "NOT_CONFIGURED" };
  } else {
    try {
      await t.sendMail({ from: process.env.EMAIL_FROM, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html });
      result = { status: "SENT" };
    } catch (e) {
      result = { status: "FAILED", error: (e as Error).message.slice(0, 500) };
    }
  }
  const scrub = (s: string | undefined) => (s === undefined ? s : (msg.redact ?? []).reduce((acc, r) => acc.split(r).join("[link removed]"), s));
  await prisma.emailMessage.create({
    data: { agencyId: msg.agencyId ?? null, to: msg.to, subject: msg.subject, text: scrub(msg.text)!, html: scrub(msg.html) ?? null, kind: msg.kind, status: result.status, error: result.error ?? null },
  });
  return result;
}

export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}
