"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { createShareLink, SHARE_RANGES, type ShareRange } from "@/server/share-links";
import { deleteClientSchedule, saveClientSchedule, sendScheduledReport } from "@/server/scheduled-reports";
import { parseRecipients, SCHEDULE_RANGES, type ScheduleRange } from "@/lib/report-schedule";

export type CreateLinkState = { url?: string; error?: string; n?: number } | undefined;
const EXPIRY_DAYS = new Set(["7", "30", "90", "365", "never"]);

export async function createShareLinkAction(clientId: string, prev: CreateLinkState, form: FormData): Promise<CreateLinkState> {
  const user = await requireClientEdit(clientId);
  const range = String(form.get("range") ?? "template") as ShareRange;
  const expiry = String(form.get("expiry") ?? "90");
  const label = String(form.get("label") ?? "").trim().slice(0, 80) || null;
  if (!SHARE_RANGES.includes(range)) return { error: "Choose a date range." };
  if (!EXPIRY_DAYS.has(expiry)) return { error: "Choose when the link expires." };
  const password = String(form.get("password") ?? "");
  if (password && (password.length < 6 || password.length > 200)) return { error: "Use a password of at least 6 characters, or leave it blank." };
  const { url } = await createShareLink({ clientId, createdById: user.id, label, range, expiresInDays: expiry === "never" ? null : Number(expiry), password: password || null });
  revalidatePath(`/clients/${clientId}/share`);
  return { url, n: (prev?.n ?? 0) + 1 };
}

export async function revokeShareLinkAction(clientId: string, linkId: string): Promise<void> {
  await requireClientEdit(clientId);
  // Scoped to the client so a link id from another client can't be revoked through this one.
  await prisma.reportShareLink.updateMany({ where: { id: linkId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath(`/clients/${clientId}/share`);
}

export type ScheduleState = { ok?: string; error?: string } | undefined;

function scheduleInput(form: FormData) {
  const frequency = form.get("frequency") === "weekly" ? "weekly" : "monthly";
  const dayOfMonth = Number(form.get("dayOfMonth") ?? 1);
  const dayOfWeek = Number(form.get("dayOfWeek") ?? 1);
  const range = String(form.get("range") ?? "last_month") as ScheduleRange;
  const { emails, invalid } = parseRecipients(String(form.get("recipients") ?? ""));
  if (invalid.length) return { error: `Not a valid email address: ${invalid.join(", ")}` };
  if (!emails.length) return { error: "Add at least one recipient." };
  if (emails.length > 20) return { error: "Send to at most 20 recipients." };
  if (frequency === "monthly" && !(Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 28)) return { error: "Choose a day from 1 to 28." };
  if (frequency === "weekly" && !(Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6)) return { error: "Choose a weekday." };
  if (!SCHEDULE_RANGES.includes(range)) return { error: "Choose a date range." };
  return { input: { frequency, dayOfMonth: frequency === "monthly" ? dayOfMonth : null, dayOfWeek: frequency === "weekly" ? dayOfWeek : null, recipients: emails, range, enabled: form.get("enabled") === "on" } as const };
}

export async function saveScheduleAction(clientId: string, _prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const user = await requireClientEdit(clientId);
  const parsed = scheduleInput(form);
  if ("error" in parsed) return { error: parsed.error };
  const s = await saveClientSchedule(user.agencyId, clientId, parsed.input);
  const { timezone } = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { timezone: true } });
  revalidatePath(`/clients/${clientId}/share`);
  revalidatePath("/settings/reports");
  return { ok: s.enabled && s.nextRunAt ? `Saved. The next report goes out ${s.nextRunAt.toLocaleString("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}.` : "Saved. The schedule is paused." };
}

export async function sendScheduleNowAction(clientId: string, _prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  await requireClientEdit(clientId);
  const parsed = scheduleInput(form);
  if ("error" in parsed) return { error: parsed.error };
  const r = await sendScheduledReport(clientId, parsed.input.range, parsed.input.recipients);
  revalidatePath("/settings/email");
  if (r.notConfigured) return { ok: `Recorded in Settings → Email log, but not delivered: outgoing email (SMTP_URL and EMAIL_FROM) isn't set up.` };
  return r.failed ? { error: `${r.sent} sent, ${r.failed} failed. See Settings → Email log.` } : { ok: `Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}.` };
}

export async function deleteScheduleAction(clientId: string): Promise<void> {
  const user = await requireClientEdit(clientId);
  await deleteClientSchedule(user.agencyId, clientId);
  revalidatePath(`/clients/${clientId}/share`);
  revalidatePath("/settings/reports");
}
