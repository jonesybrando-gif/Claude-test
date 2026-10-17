import "server-only";
import type { AlertType, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { loadPacing, type PacingRow } from "./pacing-service";
import { appUrl, sendEmail } from "./email";
import { evaluateAlerts, resolveAlertSettings, type AccountInput, type AlertCandidate, type CampaignInput, type PacingRowInput } from "@/lib/alerts";
import { alertEmail, dailySummaryEmail, type AlertLine } from "@/lib/email-templates";
import { dateToIso, dayOfWeek, todayInTimeZone } from "@/lib/pacing/dates";

const LOOKBACK_DAYS = 35;

function toRowInput(r: PacingRow): PacingRowInput {
  return {
    key: r.key,
    clientId: r.clientId,
    clientName: r.clientName,
    label: r.level === "CLIENT" ? "Combined budget" : r.label,
    currency: r.currency,
    isDemo: r.isDemo,
    disconnected: r.disconnected,
    action: { headline: r.action.headline, detail: r.action.detail },
    result: r.result
      ? { phase: r.result.phase, periodStart: r.result.periodStart, status: r.result.status, forecastStatus: r.result.forecastStatus, budgetMinor: r.result.budgetMinor, projectedVarianceMinor: r.result.projectedVarianceMinor }
      : null,
  };
}

async function staffOf(agencyId: string) {
  const users = await prisma.user.findMany({
    where: { agencyId, deactivatedAt: null, role: { in: ["AGENCY_ADMIN", "ACCOUNT_MANAGER"] } },
    include: { assignments: { select: { clientId: true } }, managedClients: { select: { id: true } } },
  });
  return users.map((u) => ({
    ...u,
    visible: new Set([...u.assignments.map((a) => a.clientId), ...u.managedClients.map((c) => c.id)]),
  }));
}

/** Same rule as canViewClient: admins see every client, managers their primary/assigned ones. */
function userCanSee(u: Awaited<ReturnType<typeof staffOf>>[number], clientId: string) {
  return u.role === "AGENCY_ADMIN" || u.visible.has(clientId);
}

async function brand(agencyId: string) {
  const a = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { name: true, brandColor: true, reportFooter: true, defaultTimezone: true } });
  return { brand: { name: a.name, color: a.brandColor, footer: a.reportFooter }, timezone: a.defaultTimezone };
}

export interface AlertRunResult {
  agencyId: string;
  created: number;
  refreshed: number;
  resolved: number;
  emailsQueued: number;
}

/** Evaluates every alert rule for an agency and reconciles stored alerts. */
export async function evaluateAgencyAlerts(agencyId: string, now: Date = new Date()): Promise<AlertRunResult> {
  const agency = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { alertSettings: true } });
  const settings = resolveAlertSettings(agency.alertSettings);
  const pacing = await loadPacing({ agencyId, archivedAt: null }, now);
  const rows = pacing.flatMap((c) => c.rows).map(toRowInput);

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const [accounts, perf] = await Promise.all([
    prisma.adAccount.findMany({
      where: { client: { agencyId, archivedAt: null } },
      include: { client: { select: { name: true } }, campaigns: { select: { id: true, name: true, status: true } }, syncRuns: { orderBy: { startedAt: "desc" }, take: 1 } },
    }),
    prisma.dailyPerformance.findMany({
      where: { account: { client: { agencyId, archivedAt: null } }, date: { gte: since } },
      select: { accountId: true, campaignId: true, date: true, costMinor: true },
    }),
  ]);
  const accountDaily = new Map<string, Record<string, number>>();
  const campaignDaily = new Map<string, Record<string, number>>();
  for (const p of perf) {
    const d = dateToIso(p.date);
    const a = accountDaily.get(p.accountId) ?? {};
    a[d] = (a[d] ?? 0) + Number(p.costMinor);
    accountDaily.set(p.accountId, a);
    if (p.campaignId) {
      const c = campaignDaily.get(p.campaignId) ?? {};
      c[d] = (c[d] ?? 0) + Number(p.costMinor);
      campaignDaily.set(p.campaignId, c);
    }
  }
  const accountInputs: AccountInput[] = accounts.map((a) => {
    const run = a.syncRuns[0];
    return {
      id: a.id,
      name: a.name,
      clientId: a.clientId,
      clientName: a.client.name,
      currency: a.currency,
      isDemo: a.isDemo,
      monitored: a.isDemo || !!a.connectionId,
      status: a.status,
      lastSuccessfulSyncAt: a.lastSuccessfulSyncAt,
      lastSyncFailed: run && (run.status === "FAILED" || run.status === "PARTIAL") ? { at: run.startedAt, error: run.error ?? "Sync failed" } : null,
      dataCompleteThrough: a.dataCompleteThrough ? dateToIso(a.dataCompleteThrough) : null,
      daily: accountDaily.get(a.id) ?? {},
    };
  });
  const campaignInputs: CampaignInput[] = accounts.flatMap((a) => a.campaigns.map((c) => ({ id: c.id, name: c.name, accountId: a.id, status: c.status, daily: campaignDaily.get(c.id) ?? {} })));

  const candidates = evaluateAlerts({ rows, accounts: accountInputs, campaigns: campaignInputs, settings, now });
  return reconcile(agencyId, candidates, now);
}

async function reconcile(agencyId: string, candidates: AlertCandidate[], now: Date): Promise<AlertRunResult> {
  const existing = await prisma.alert.findMany({ where: { agencyId, status: { in: ["OPEN", "ACKNOWLEDGED"] } } });
  const byKey = new Map(existing.map((a) => [a.dedupeKey, a]));
  const seen = new Set<string>();
  const created: { id: string; c: AlertCandidate }[] = [];
  let refreshed = 0;
  for (const c of candidates) {
    if (seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    const details: Prisma.InputJsonValue = { detail: c.detail, clientName: c.clientName, isDemo: c.isDemo };
    const prev = byKey.get(c.dedupeKey);
    if (prev) {
      await prisma.alert.update({ where: { id: prev.id }, data: { lastSeenAt: now, message: c.title, details, severity: c.severity } });
      refreshed++;
    } else {
      const a = await prisma.alert.create({
        data: { agencyId, clientId: c.clientId, accountId: c.accountId ?? null, type: c.kind as AlertType, severity: c.severity, dedupeKey: c.dedupeKey, message: c.title, details, firstSeenAt: now, lastSeenAt: now },
      });
      created.push({ id: a.id, c });
    }
  }
  const stale = existing.filter((a) => !seen.has(a.dedupeKey)).map((a) => a.id);
  if (stale.length) await prisma.alert.updateMany({ where: { id: { in: stale } }, data: { status: "RESOLVED", resolvedAt: now } });

  const emailsQueued = created.length ? await notify(agencyId, created) : 0;
  return { agencyId, created: created.length, refreshed, resolved: stale.length, emailsQueued };
}

/** In-app notification for every staff member who can see the client; one email per person per run. */
async function notify(agencyId: string, created: { id: string; c: AlertCandidate }[]): Promise<number> {
  const staff = await staffOf(agencyId);
  const { brand: b } = await brand(agencyId);
  let emails = 0;
  for (const u of staff) {
    const mine = created.filter((x) => userCanSee(u, x.c.clientId));
    if (!mine.length) continue;
    await prisma.notification.createMany({
      data: mine.map((x) => ({ userId: u.id, alertId: x.id, channel: "in_app", title: `${x.c.clientName}: ${x.c.title}`, body: x.c.detail })),
    });
    if (u.emailAlerts) {
      const lines: AlertLine[] = mine.map((x) => ({ severity: x.c.severity, client: x.c.clientName, title: x.c.title, detail: x.c.detail }));
      await sendEmail({ agencyId, to: u.email, kind: "alert", ...alertEmail(b, lines, appUrl("/alerts")) });
      emails++;
    }
  }
  return emails;
}

/**
 * Weekday-morning summary (from 7:00 in the agency's time zone), at most once
 * per person per day, listing the budget lines that need action.
 */
export async function sendDailySummaries(agencyId: string, now: Date = new Date()): Promise<number> {
  const { brand: b, timezone } = await brand(agencyId);
  const today = todayInTimeZone(timezone, now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now));
  const dow = dayOfWeek(today);
  if (dow === 0 || dow === 6 || hour < 7) return 0;

  const staff = (await staffOf(agencyId)).filter((u) => u.dailySummary && (!u.lastDailySummaryAt || todayInTimeZone(timezone, u.lastDailySummaryAt) < today));
  if (!staff.length) return 0;
  const rows = (await loadPacing({ agencyId, archivedAt: null }, now)).flatMap((c) => c.rows);
  const label = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  let sent = 0;
  for (const u of staff) {
    const mine = rows.filter((r) => userCanSee(u, r.clientId));
    if (!mine.length) continue;
    const needAction: AlertLine[] = mine
      .filter((r) => r.action.severity === "critical" || r.action.severity === "warning")
      .sort((a, z) => (a.action.severity === z.action.severity ? 0 : a.action.severity === "critical" ? -1 : 1))
      .map((r) => ({ severity: r.action.severity as "critical" | "warning", client: r.clientName, title: r.action.headline, detail: r.action.detail }));
    const onTarget = mine.filter((r) => r.action.severity === "ok").length;
    await sendEmail({ agencyId, to: u.email, kind: "daily_summary", ...dailySummaryEmail(b, label, needAction, onTarget, appUrl("/dashboard")) });
    await prisma.user.update({ where: { id: u.id }, data: { lastDailySummaryAt: now } });
    sent++;
  }
  return sent;
}

/** Alerts + daily summaries for every agency. Called by the cron endpoints and `npm run alerts`. */
export async function runAllAlerts(now: Date = new Date()) {
  const agencies = await prisma.agency.findMany({ select: { id: true } });
  const results = [];
  for (const a of agencies) {
    const r = await evaluateAgencyAlerts(a.id, now);
    const summaries = await sendDailySummaries(a.id, now);
    results.push({ ...r, summaries });
  }
  return results;
}
