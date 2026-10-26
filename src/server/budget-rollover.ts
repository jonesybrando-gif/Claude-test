import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { addDays, dateToIso, isoToDate, monthBounds, todayInTimeZone, type IsoDate } from "@/lib/pacing/dates";
import { COPY_BANNER_FROM_DAY, nextMonth, planCopyToNextMonth, planRollForward, previousMonth, type PlannedCopy, type RolloverBudget } from "@/lib/budget-rollover";

// Carries whole-month budgets into the next calendar month.
//
// - rollForwardBudgets(): automatic. Last month's budgets marked "Repeats every
//   month" are created for the client's current month if missing. Runs from the
//   hourly scheduler, /api/cron/sync, and lazily when pacing loads.
// - copyBudgetsToNextMonth(): the one-click "Copy October budgets to November"
//   action, which copies every whole-month budget (repeating or not).
//
// Both write inside a transaction holding a per-client Postgres advisory lock
// and re-plan inside it, so concurrent runs (scheduler + page load + button)
// can never create the same budget twice.

const budgetSelect = {
  id: true,
  clientId: true,
  scope: true,
  accountId: true,
  campaignId: true,
  periodStart: true,
  periodEnd: true,
  currency: true,
  distribution: true,
  weekendWeight: true,
  weekdayWeights: true,
  forecastModel: true,
  repeatsMonthly: true,
  campaign: { select: { excludedAt: true, status: true } },
  revisions: { orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], take: 1, select: { amountMinor: true } },
} satisfies Prisma.BudgetSelect;

type LoadedBudget = Prisma.BudgetGetPayload<{ select: typeof budgetSelect }>;
type PlanBudget = RolloverBudget & { row: LoadedBudget };

const toPlan = (b: LoadedBudget): PlanBudget => ({
  id: b.id,
  scope: b.scope,
  accountId: b.accountId,
  campaignId: b.campaignId,
  periodStart: dateToIso(b.periodStart),
  periodEnd: dateToIso(b.periodEnd),
  repeatsMonthly: b.repeatsMonthly,
  row: b,
});

type Db = Prisma.TransactionClient | typeof prisma;

/** A client's budgets touching [from, to]. Removed campaigns' budgets are not copied. */
async function clientBudgets(db: Db, clientId: string, from: IsoDate, to: IsoDate): Promise<PlanBudget[]> {
  const rows = await db.budget.findMany({
    where: { clientId, periodStart: { lte: isoToDate(to) }, periodEnd: { gte: isoToDate(from) } },
    select: budgetSelect,
  });
  return rows.map(toPlan);
}

const usable = (p: PlannedCopy<PlanBudget>) => p.source.row.revisions.length > 0 && !(p.source.scope === "CAMPAIGN" && (p.source.row.campaign?.excludedAt || p.source.row.campaign?.status === "REMOVED"));

async function writeCopies(tx: Prisma.TransactionClient, plans: PlannedCopy<PlanBudget>[], note: string, createdById: string | null, repeatsMonthly: (b: PlanBudget) => boolean) {
  for (const p of plans.filter(usable)) {
    const b = p.source.row;
    await tx.budget.create({
      data: {
        clientId: b.clientId,
        scope: b.scope,
        accountId: b.accountId,
        campaignId: b.campaignId,
        periodStart: isoToDate(p.periodStart),
        periodEnd: isoToDate(p.periodEnd),
        currency: b.currency,
        distribution: b.distribution,
        weekendWeight: b.weekendWeight,
        weekdayWeights: b.weekdayWeights ?? undefined,
        forecastModel: b.forecastModel,
        repeatsMonthly: repeatsMonthly(p.source),
        // No pauses or day-specific weights: those were for last month's dates.
        revisions: { create: [{ amountMinor: b.revisions[0].amountMinor, effectiveDate: isoToDate(p.periodStart), note, createdById }] },
      },
    });
  }
  return plans.filter(usable).length;
}

/**
 * Locks one client's budgets for the rest of the transaction. Never waits: if
 * another request is already rolling this client forward, returns false and
 * the caller skips (that request does the work).
 */
async function lockClient(tx: Prisma.TransactionClient, clientId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`budget-rollover:${clientId}`})) AS locked`;
  return rows[0]?.locked === true;
}

async function rollClient(clientId: string, today: IsoDate): Promise<number> {
  const from = previousMonth(today).start;
  const to = monthBounds(today).end;
  return prisma.$transaction(async (tx) => {
    if (!(await lockClient(tx, clientId))) return 0;
    const plans = planRollForward(await clientBudgets(tx, clientId, from, to), today);
    return writeCopies(tx, plans, "Repeated from last month", null, () => true);
  }, { timeout: 30_000, maxWait: 5_000 });
}

/**
 * Creates this month's budget for every last-month budget marked "Repeats every
 * month" that has no counterpart yet. Safe to call often and concurrently.
 * Pass clientIds to limit the work (e.g. the clients a page is about to show).
 */
export async function rollForwardBudgets(now: Date = new Date(), opts: { clientIds?: string[] } = {}): Promise<{ clients: number; created: number }> {
  // Candidates: repeating budgets that ended recently (any client timezone).
  const today = dateToIso(now);
  const candidates = await prisma.budget.findMany({
    where: {
      repeatsMonthly: true,
      periodEnd: { gte: isoToDate(addDays(today, -45)), lte: isoToDate(addDays(today, 1)) },
      client: { archivedAt: null },
      ...(opts.clientIds ? { clientId: { in: opts.clientIds } } : {}),
    },
    select: { clientId: true, client: { select: { timezone: true } } },
    distinct: ["clientId"],
  });
  if (candidates.length === 0) return { clients: 0, created: 0 };
  // Cheap check in memory with one query; only clients with work take the lock.
  const all = await prisma.budget.findMany({
    where: { clientId: { in: candidates.map((c) => c.clientId) }, periodStart: { lte: isoToDate(addDays(today, 40)) }, periodEnd: { gte: isoToDate(addDays(today, -75)) } },
    select: budgetSelect,
  });
  let created = 0;
  let clients = 0;
  for (const c of candidates) {
    const local = todayInTimeZone(c.client.timezone, now);
    const mine = all.filter((b) => b.clientId === c.clientId).map(toPlan);
    if (planRollForward(mine, local).filter(usable).length === 0) continue;
    try {
      const n = await rollClient(c.clientId, local);
      if (n > 0) {
        created += n;
        clients += 1;
      }
    } catch (e) {
      console.error(`[budget-rollover] client ${c.clientId} failed`, e);
    }
  }
  return { clients, created };
}

/** Per client: how many of this month's whole-month budgets would be copied to next month. */
async function pendingCopies(clientWhere: Prisma.ClientWhereInput, now: Date) {
  const clients = await prisma.client.findMany({ where: clientWhere, select: { id: true, timezone: true } });
  if (clients.length === 0) return [];
  const utc = dateToIso(now);
  const all = await prisma.budget.findMany({
    where: { clientId: { in: clients.map((c) => c.id) }, periodStart: { lte: isoToDate(addDays(utc, 70)) }, periodEnd: { gte: isoToDate(addDays(utc, -35)) } },
    select: budgetSelect,
  });
  const out: { clientId: string; today: IsoDate; count: number }[] = [];
  for (const c of clients) {
    const today = todayInTimeZone(c.timezone, now);
    const budgets = all.filter((b) => b.clientId === c.id).map(toPlan);
    const count = planCopyToNextMonth(budgets, today).filter(usable).length;
    if (count > 0) out.push({ clientId: c.id, today, count });
  }
  return out;
}

export interface CopyBannerState {
  /** Clients with this month's budgets that have none for next month yet. */
  clients: number;
  fromMonth: IsoDate;
  toMonth: IsoDate;
}

/**
 * For the "Copy October budgets to November" banner: null before the 25th
 * (in the agency's timezone) or when there is nothing to copy.
 */
export async function copyBannerState(clientWhere: Prisma.ClientWhereInput, agencyTimezone: string, now: Date = new Date()): Promise<CopyBannerState | null> {
  const today = todayInTimeZone(agencyTimezone, now);
  if (Number(today.slice(8, 10)) < COPY_BANNER_FROM_DAY) return null;
  // Only budgets that touch this month or next (any client timezone) can count.
  const anyBudgets = await prisma.budget.count({ where: { client: clientWhere, periodEnd: { gte: isoToDate(addDays(today, -1)) } } });
  if (anyBudgets === 0) return null;
  const pending = await pendingCopies(clientWhere, now);
  if (pending.length === 0) return null;
  return { clients: pending.length, fromMonth: monthBounds(today).start, toMonth: nextMonth(today).start };
}

/**
 * Copies every whole-month budget of the current month to next month for the
 * given clients (the caller has already checked edit access). Repeating
 * budgets stay repeating; one-off ones are copied once and keep their setting.
 */
export async function copyBudgetsToNextMonth(clientWhere: Prisma.ClientWhereInput, createdById: string, now: Date = new Date()): Promise<{ clients: number; created: number }> {
  const pending = await pendingCopies(clientWhere, now);
  let clients = 0;
  let created = 0;
  for (const p of pending) {
    const n = await prisma.$transaction(async (tx) => {
      if (!(await lockClient(tx, p.clientId))) return 0;
      const budgets = await clientBudgets(tx, p.clientId, monthBounds(p.today).start, nextMonth(p.today).end);
      return writeCopies(tx, planCopyToNextMonth(budgets, p.today), "Copied from last month", createdById, (b) => b.repeatsMonthly);
    }, { timeout: 30_000, maxWait: 5_000 });
    if (n > 0) {
      clients += 1;
      created += n;
    }
  }
  return { clients, created };
}
