"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { validateNewBudget, validateRevision } from "@/lib/budget-validation";
import { parseMoneyToMinor } from "@/lib/money";
import { dateToIso, isoToDate } from "@/lib/pacing/dates";

export type FormState = { ok?: string; errors?: string[] } | undefined;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const createSchema = z.object({
  scope: z.enum(["CLIENT", "ACCOUNT", "CAMPAIGN"]),
  target: z.string().optional(),
  periodStart: isoDate,
  periodEnd: isoDate,
  amount: z.string().min(1, "Enter a budget amount"),
  distribution: z.enum(["EVEN", "BUSINESS_DAYS", "WEEKEND_WEIGHTED"]),
  weekendWeight: z.string().optional(),
  forecastModel: z.enum(["STRAIGHT_LINE", "TRAILING_7_DAY"]),
  pauseStart: z.string().optional(),
  pauseEnd: z.string().optional(),
});

export async function createBudget(clientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireClientEdit(clientId);
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const f = parsed.data;

  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(f.amount);
  } catch (e) {
    return { errors: [(e as Error).message] };
  }

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { accounts: { include: { campaigns: { select: { id: true } } } }, budgets: true },
  });
  let accountId: string | null = null;
  let campaignId: string | null = null;
  if (f.scope === "ACCOUNT") {
    accountId = client.accounts.find((a) => a.id === f.target)?.id ?? null;
  } else if (f.scope === "CAMPAIGN") {
    const acc = client.accounts.find((a) => a.campaigns.some((c) => c.id === f.target));
    accountId = acc?.id ?? null;
    campaignId = acc ? f.target! : null;
  }

  const errors = validateNewBudget(
    { scope: f.scope, accountId, campaignId, periodStart: f.periodStart, periodEnd: f.periodEnd, amountMinor },
    client.budgets.map((b) => ({ id: b.id, scope: b.scope, accountId: b.accountId, campaignId: b.campaignId, periodStart: dateToIso(b.periodStart), periodEnd: dateToIso(b.periodEnd) })),
  );
  let weekendWeight: number | null = null;
  if (f.distribution === "WEEKEND_WEIGHTED") {
    weekendWeight = Number(f.weekendWeight);
    if (!Number.isFinite(weekendWeight) || weekendWeight < 0 || weekendWeight > 10) errors.push("Weekend weight must be between 0 and 10.");
  }
  let pauses: { start: string; end: string }[] | undefined;
  if (f.pauseStart || f.pauseEnd) {
    if (!f.pauseStart || !f.pauseEnd || f.pauseEnd < f.pauseStart) errors.push("Enter both pause dates, with the end on or after the start.");
    else pauses = [{ start: f.pauseStart, end: f.pauseEnd }];
  }
  if (errors.length) return { errors };

  await prisma.budget.create({
    data: {
      clientId,
      scope: f.scope,
      accountId,
      campaignId,
      periodStart: isoToDate(f.periodStart),
      periodEnd: isoToDate(f.periodEnd),
      currency: client.currency,
      distribution: f.distribution,
      weekendWeight,
      forecastModel: f.forecastModel,
      pauses,
      revisions: { create: [{ amountMinor: BigInt(amountMinor), effectiveDate: isoToDate(f.periodStart), note: "Initial budget", createdById: user.id }] },
    },
  });
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/dashboard");
  return { ok: "Budget saved." };
}

const reviseSchema = z.object({ budgetId: z.string(), amount: z.string().min(1), effectiveDate: isoDate, note: z.string().max(200).optional() });

export async function reviseBudget(clientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireClientEdit(clientId);
  const parsed = reviseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const f = parsed.data;
  const budget = await prisma.budget.findFirst({ where: { id: f.budgetId, clientId } });
  if (!budget) return { errors: ["Budget not found."] };
  let amountMinor: number;
  try {
    amountMinor = parseMoneyToMinor(f.amount);
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
  const errors = validateRevision(dateToIso(budget.periodStart), dateToIso(budget.periodEnd), f.effectiveDate, amountMinor);
  if (errors.length) return { errors };
  await prisma.budgetRevision.create({
    data: { budgetId: budget.id, amountMinor: BigInt(amountMinor), effectiveDate: isoToDate(f.effectiveDate), note: f.note || null, createdById: user.id },
  });
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/dashboard");
  return { ok: "Budget revised." };
}

export async function deleteBudget(clientId: string, form: FormData): Promise<void> {
  await requireClientEdit(clientId);
  const budgetId = String(form.get("budgetId"));
  await prisma.budget.deleteMany({ where: { id: budgetId, clientId } });
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/dashboard");
}
