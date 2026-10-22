import "server-only";
import { prisma } from "./db";
import { loadClientReport } from "./client-report";
import { getExecutiveSummary } from "./exec-summary";
import { createShareLink, type ShareRange } from "./share-links";
import { renderClientReportPdf } from "./pdf/reports";
import { agencyBrand } from "./pdf/brand";
import { sendEmail } from "./email";
import { summaryAsHtml, summaryAsText } from "@/lib/exec-summary";
import { PRESET_LABEL, type RangePreset } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";

// Monthly report emails: on the chosen day at 8:00 in the client's time zone,
// email the report (a fresh 90-day link and/or the PDF) with the executive
// summary in the body.

export const SEND_HOUR = 8;
export const SCHEDULE_RANGES = ["last_month", "last_30", "mtd"] as const satisfies readonly ShareRange[];
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export class ScheduleError extends Error {}

/** Milliseconds a time zone is ahead of UTC at a given instant. */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((p) => [p.type, p.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** The next send time strictly after `after`: day `dayOfMonth`, 8:00 in `timeZone`. */
export function nextRunAfter(dayOfMonth: number, timeZone: string, after: Date): Date {
  const local = new Date(after.getTime() + tzOffsetMs(after, timeZone));
  for (let i = 0; i < 3; i++) {
    const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + i, dayOfMonth, SEND_HOUR);
    // Convert local wall time to UTC (twice, to settle DST edges).
    let utc = guess - tzOffsetMs(new Date(guess), timeZone);
    utc = guess - tzOffsetMs(new Date(utc), timeZone);
    if (utc > after.getTime()) return new Date(utc);
  }
  throw new Error("unreachable");
}

export function parseRecipients(raw: string): string[] {
  const list = [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!list.length) throw new ScheduleError("Add at least one email address.");
  if (list.length > 10) throw new ScheduleError("Send to 10 addresses at most.");
  const bad = list.find((e) => !EMAIL_RE.test(e));
  if (bad) throw new ScheduleError(`“${bad}” isn't a valid email address.`);
  return list;
}

export async function saveSchedule(
  agencyId: string,
  clientId: string,
  input: { dayOfMonth: number; recipients: string; range: string; attachPdf: boolean; includeLink: boolean; active: boolean; userId: string },
  now: Date = new Date(),
) {
  const client = await prisma.client.findFirst({ where: { id: clientId, agencyId, archivedAt: null }, select: { timezone: true } });
  if (!client) throw new ScheduleError("Client not found.");
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28) throw new ScheduleError("Choose a day between 1 and 28.");
  if (!(SCHEDULE_RANGES as readonly string[]).includes(input.range)) throw new ScheduleError("Choose a date range.");
  if (!input.attachPdf && !input.includeLink) throw new ScheduleError("Send a link, a PDF, or both.");
  const recipients = parseRecipients(input.recipients).join(", ");
  const data = { dayOfMonth: input.dayOfMonth, recipients, range: input.range, attachPdf: input.attachPdf, includeLink: input.includeLink, active: input.active, nextRunAt: nextRunAfter(input.dayOfMonth, client.timezone, now) };
  return prisma.clientReportSchedule.upsert({ where: { clientId }, create: { clientId, createdById: input.userId, ...data }, update: data });
}

/** Builds and sends one client's scheduled report now. Returns a short status for the schedule row. */
export async function sendScheduledReport(clientId: string, opts: { now?: Date; to?: string[] } = {}): Promise<string> {
  const now = opts.now ?? new Date();
  const s = await prisma.clientReportSchedule.findUniqueOrThrow({ where: { clientId }, include: { client: { select: { name: true, agencyId: true, archivedAt: true } } } });
  if (s.client.archivedAt) return "Skipped: client removed";
  const rep = await loadClientReport(clientId, { range: s.range }, now);
  const summary = await getExecutiveSummary(rep, { generate: true, now });
  const period = `${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  const monthName = rep.preset === "last_month" ? formatDate(rep.range.from, { month: "long", year: "numeric" }) : period;
  const heading = `${s.client.name}: performance summary, ${period}`;
  const brand = await agencyBrand(s.client.agencyId);

  let link: string | null = null;
  if (s.includeLink) {
    const owner = s.createdById ?? (await prisma.user.findFirst({ where: { agencyId: s.client.agencyId, role: "AGENCY_ADMIN" }, select: { id: true } }))?.id;
    if (owner) {
      link = (await createShareLink({ clientId, createdById: owner, label: `${s.client.name} · ${PRESET_LABEL[s.range as RangePreset] ?? s.range} (scheduled ${formatDate(now.toISOString().slice(0, 10))})`, range: s.range as ShareRange, expiresInDays: 90, now })).url;
    }
  }
  const pdf = s.attachPdf ? await renderClientReportPdf(rep, brand, { internal: false, executiveSummary: summary }) : null;
  const button = link
    ? `<p style="margin:20px 0;"><a href="${link}" style="background:${brand.color};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;">View the full report</a></p>`
    : "";
  const html = `${summaryAsHtml(summary, heading)}${button}<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b6b6b;">${s.attachPdf ? "The full report is attached as a PDF. " : ""}${link ? "The link works for 90 days. " : ""}Sent by ${brand.name}.</p>`;
  const text = `${summaryAsText(summary, heading)}${link ? `\n\nView the full report: ${link}` : ""}\n\nSent by ${brand.name}.`;
  const filename = `${s.client.name.replace(/[^\w\- ]+/g, "").trim() || "report"} - ${monthName}.pdf`;

  const recipients = opts.to ?? s.recipients.split(/,\s*/).filter(Boolean);
  const results = [];
  for (const to of recipients) {
    results.push(
      await sendEmail({
        agencyId: s.client.agencyId,
        to,
        kind: "scheduled_report",
        subject: `${s.client.name}: advertising report, ${monthName}`,
        html,
        text,
        attachments: pdf ? [{ filename, content: pdf, contentType: "application/pdf" }] : undefined,
        redact: link ? [link] : undefined,
      }),
    );
  }
  const sent = results.filter((r) => r.status === "SENT").length;
  if (results.every((r) => r.status === "NOT_CONFIGURED")) return "Not sent: email isn't configured (SMTP_URL, EMAIL_FROM)";
  return sent === results.length ? `Sent to ${sent}` : `Sent to ${sent} of ${results.length}; ${results.find((r) => r.error)?.error ?? "some failed"}`;
}

/** Sends every schedule that is due. Called by the hourly scheduler and cron. */
export async function runDueSchedules(now: Date = new Date()): Promise<number> {
  const due = await prisma.clientReportSchedule.findMany({ where: { active: true, nextRunAt: { lte: now }, client: { archivedAt: null } }, include: { client: { select: { timezone: true } } } });
  for (const s of due) {
    let status: string;
    try {
      status = await sendScheduledReport(s.clientId, { now });
    } catch (e) {
      status = `Failed: ${(e as Error).message.slice(0, 200)}`;
      console.error("[schedules] send failed", s.clientId, e);
    }
    await prisma.clientReportSchedule.update({ where: { id: s.id }, data: { lastSentAt: now, lastStatus: status, nextRunAt: nextRunAfter(s.dayOfMonth, s.client.timezone, now) } });
  }
  return due.length;
}
