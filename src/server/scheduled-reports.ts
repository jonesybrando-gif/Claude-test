import "server-only";
import { prisma } from "./db";
import { loadClientReport } from "./client-report";
import { getExecutiveSummary } from "./exec-summary";
import { renderClientReportPdf } from "./pdf/reports";
import { agencyBrand } from "./pdf/brand";
import { emailConfigured, sendEmail } from "./email";
import { rangeLabel } from "@/lib/date-ranges";
import { summaryAsHtml, summaryAsText } from "@/lib/exec-summary";
import { scheduledReportEmail } from "@/lib/email-templates";
import { formatDate } from "@/lib/time";
import { slug } from "@/lib/csv";
import { nextRunAt, SCHEDULE_RANGES, type ScheduleFrequency, type ScheduleRange } from "@/lib/report-schedule";

// Scheduled client reports. Each client can have one schedule, stored as a
// Report (kind SCHEDULE, config = { range }) with one ReportSchedule. The
// hourly job sends every schedule whose nextRunAt has passed: the
// client-facing PDF attached and the executive summary in the body.

const KIND = "SCHEDULE";

export interface ClientSchedule {
  reportId: string;
  scheduleId: string;
  frequency: ScheduleFrequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  recipients: string[];
  range: ScheduleRange;
  enabled: boolean;
  lastSentAt: Date | null;
  nextRunAt: Date | null;
}

const rangeOf = (config: unknown): ScheduleRange => {
  const r = (config as { range?: unknown } | null)?.range;
  return SCHEDULE_RANGES.includes(r as ScheduleRange) ? (r as ScheduleRange) : "last_month";
};

export async function getClientSchedule(clientId: string): Promise<ClientSchedule | null> {
  const report = await prisma.report.findFirst({ where: { clientId, kind: KIND }, include: { schedules: { take: 1 } }, orderBy: { createdAt: "asc" } });
  const s = report?.schedules[0];
  if (!report || !s) return null;
  return {
    reportId: report.id,
    scheduleId: s.id,
    frequency: s.frequency === "weekly" ? "weekly" : "monthly",
    dayOfMonth: s.dayOfMonth,
    dayOfWeek: s.dayOfWeek,
    recipients: s.recipients,
    range: rangeOf(report.config),
    enabled: s.enabled,
    lastSentAt: s.lastSentAt,
    nextRunAt: s.nextRunAt,
  };
}

/** Every schedule in an agency, for Settings → Reports. */
export async function listAgencySchedules(agencyId: string) {
  const reports = await prisma.report.findMany({
    where: { agencyId, kind: KIND, client: { archivedAt: null } },
    include: { schedules: { take: 1 }, client: { select: { id: true, name: true } } },
    orderBy: { client: { name: "asc" } },
  });
  return reports.filter((r) => r.client && r.schedules[0]).map((r) => ({ client: r.client!, schedule: r.schedules[0], range: rangeOf(r.config) }));
}

export async function saveClientSchedule(
  agencyId: string,
  clientId: string,
  input: { frequency: ScheduleFrequency; dayOfMonth: number | null; dayOfWeek: number | null; recipients: string[]; range: ScheduleRange; enabled: boolean },
  now: Date = new Date(),
): Promise<ClientSchedule> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, timezone: true } });
  const next = input.enabled ? nextRunAt(input, client.timezone, now) : null;
  const data = { frequency: input.frequency, dayOfMonth: input.frequency === "monthly" ? input.dayOfMonth : null, dayOfWeek: input.frequency === "weekly" ? input.dayOfWeek : null, recipients: input.recipients, enabled: input.enabled, nextRunAt: next };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.report.findFirst({ where: { agencyId, clientId, kind: KIND }, include: { schedules: { take: 1 } } });
    if (existing) {
      await tx.report.update({ where: { id: existing.id }, data: { config: { range: input.range }, name: `${client.name} scheduled report` } });
      if (existing.schedules[0]) await tx.reportSchedule.update({ where: { id: existing.schedules[0].id }, data });
      else await tx.reportSchedule.create({ data: { ...data, reportId: existing.id } });
    } else {
      await tx.report.create({ data: { agencyId, clientId, kind: KIND, name: `${client.name} scheduled report`, config: { range: input.range }, schedules: { create: data } } });
    }
  });
  return (await getClientSchedule(clientId))!;
}

export async function deleteClientSchedule(agencyId: string, clientId: string) {
  await prisma.report.deleteMany({ where: { agencyId, clientId, kind: KIND } });
}

/** Builds and sends one client's scheduled report to its recipients. Returns how many emails were sent. */
export async function sendScheduledReport(clientId: string, range: ScheduleRange, recipients: string[], now: Date = new Date()): Promise<{ sent: number; failed: number; notConfigured: number }> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { agencyId: true, primaryManager: { select: { email: true } } } });
  const rep = await loadClientReport(clientId, { range }, now);
  const brand = await agencyBrand(client.agencyId);
  const summary = await getExecutiveSummary(rep, { generate: true, now });
  const pdf = await renderClientReportPdf(rep, brand, { internal: false, executiveSummary: summary, generatedAt: now });
  const period = `${rangeLabel(rep.preset, rep.range)} (${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })})`;
  const heading = `${rep.client.name}: performance summary, ${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  const email = scheduledReportEmail(
    { name: brand.name, color: brand.color, footer: brand.footer },
    { clientName: rep.client.name, title: rep.template.title, period, summaryText: summaryAsText(summary, heading, { clientFacing: true }), summaryHtml: summaryAsHtml(summary, heading, { clientFacing: true }) },
  );
  const filename = `${slug(rep.client.name)}-report-${rep.range.from}-to-${rep.range.to}.pdf`;
  const out = { sent: 0, failed: 0, notConfigured: 0 };
  for (const to of recipients) {
    const r = await sendEmail({ agencyId: client.agencyId, to, kind: "scheduled_report", replyTo: client.primaryManager?.email, ...email, attachments: [{ filename, content: pdf, contentType: "application/pdf" }] });
    if (r.status === "SENT") out.sent++;
    else if (r.status === "FAILED") out.failed++;
    else out.notConfigured++;
  }
  return out;
}

/** Sends every enabled schedule that is due. Called by the hourly job. */
export async function sendDueScheduledReports(now: Date = new Date()) {
  const due = await prisma.reportSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now }, report: { kind: KIND, client: { archivedAt: null } } },
    include: { report: { include: { client: { select: { id: true, timezone: true } } } } },
  });
  const results: { clientId: string; sent: number; failed: number; skipped?: string; error?: string }[] = [];
  for (const s of due) {
    const client = s.report.client;
    if (!client) continue;
    try {
      // Move the schedule on first, so a failure can't resend every hour. The
      // update only matches while nextRunAt is unchanged, so if the cron route
      // and the built-in scheduler run at once, only one of them sends.
      const rule = { frequency: (s.frequency === "weekly" ? "weekly" : "monthly") as ScheduleFrequency, dayOfMonth: s.dayOfMonth, dayOfWeek: s.dayOfWeek };
      const claimed = await prisma.reportSchedule.updateMany({ where: { id: s.id, nextRunAt: s.nextRunAt }, data: { nextRunAt: nextRunAt(rule, client.timezone, now) } });
      if (claimed.count === 0) continue;
      // Without SMTP nothing can be delivered: don't spend an AI summary and a
      // PDF render on it, and don't record it as sent.
      if (!emailConfigured()) {
        results.push({ clientId: client.id, sent: 0, failed: 0, skipped: "email not configured" });
        continue;
      }
      const r = await sendScheduledReport(client.id, rangeOf(s.report.config), s.recipients, now);
      if (r.sent > 0) await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastSentAt: now } });
      results.push({ clientId: client.id, sent: r.sent, failed: r.failed });
    } catch (e) {
      console.error("[scheduled-reports] failed", client.id, e);
      results.push({ clientId: client.id, sent: 0, failed: s.recipients.length, error: (e as Error).message });
    }
  }
  return results;
}
