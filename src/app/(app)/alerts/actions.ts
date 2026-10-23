"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireAdmin, requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { evaluateAgencyAlerts } from "@/server/alerts";

/** Alerts this person may act on: their agency's, for clients they can see. */
async function scope(ids: string[]) {
  const user = await requireAgencyStaff();
  const clients = await prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true } });
  return { user, where: { id: { in: ids.slice(0, 500) }, agencyId: user.agencyId, clientId: { in: clients.map((c) => c.id) } } };
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  await acknowledgeAlerts([alertId]);
}

/** Bulk acknowledge (one client's group, or everything shown). */
export async function acknowledgeAlerts(alertIds: string[]): Promise<void> {
  const { user, where } = await scope(alertIds);
  await prisma.alert.updateMany({ where: { ...where, status: "OPEN" }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id } });
  revalidatePath("/alerts");
}

/** Hides alerts from the open list for a while. They stay open, keep updating and resolve on their own. */
export async function snoozeAlerts(alertIds: string[], days: number): Promise<void> {
  if (![1, 3, 7].includes(days)) return;
  const { where } = await scope(alertIds);
  await prisma.alert.updateMany({ where: { ...where, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, data: { snoozedUntil: new Date(Date.now() + days * 86_400_000) } });
  revalidatePath("/alerts");
}

export async function unsnoozeAlerts(alertIds: string[]): Promise<void> {
  const { where } = await scope(alertIds);
  await prisma.alert.updateMany({ where, data: { snoozedUntil: null } });
  revalidatePath("/alerts");
}

export async function checkAlertsNow(): Promise<string> {
  const admin = await requireAdmin();
  const r = await evaluateAgencyAlerts(admin.agencyId);
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
  return `${r.created} new, ${r.refreshed} still open, ${r.resolved} resolved.`;
}
