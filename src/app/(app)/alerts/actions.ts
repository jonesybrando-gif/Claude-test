"use server";

import { revalidatePath } from "next/cache";
import type { AlertType } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireAdmin, requireAgencyStaff, userCanEditClient, visibleClientsWhere } from "@/server/access";
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
  revalidatePath("/insights");
  revalidatePath("/", "layout");
}

/** Hides alerts from the open list for a while. They stay open, keep updating and resolve on their own. */
export async function snoozeAlerts(alertIds: string[], days: number): Promise<void> {
  if (![1, 3, 7].includes(days)) return;
  const { where } = await scope(alertIds);
  await prisma.alert.updateMany({ where: { ...where, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, data: { snoozedUntil: new Date(Date.now() + days * 86_400_000) } });
  revalidatePath("/insights");
}

export async function unsnoozeAlerts(alertIds: string[]): Promise<void> {
  const { where } = await scope(alertIds);
  await prisma.alert.updateMany({ where, data: { snoozedUntil: null } });
  revalidatePath("/insights");
}

export async function checkAlertsNow(): Promise<string> {
  const admin = await requireAdmin();
  const r = await evaluateAgencyAlerts(admin.agencyId);
  revalidatePath("/insights");
  revalidatePath("/", "layout");
  return `${r.created} new, ${r.refreshed} still open, ${r.resolved} resolved.`;
}

const MUTABLE: AlertType[] = ["OVERSPENDING", "UNDERSPENDING", "PROJECTED_OVERRUN", "SPEND_SPIKE", "SPEND_STOPPED", "CAMPAIGN_NO_SPEND", "SYNC_FAILED", "ACCOUNT_DISCONNECTED", "CPA_SPIKE", "RESULTS_DROP", "TRACKING_ZERO"];

/**
 * Stops one alert type for one client (Client.mutedAlertTypes): no new alerts,
 * emails or Slack posts of that type for the client, and its open ones close.
 */
export async function muteAlertType(clientId: string, type: string): Promise<void> {
  if (!MUTABLE.includes(type as AlertType)) return;
  const user = await requireAgencyStaff();
  if (!(await userCanEditClient(user, clientId))) return;
  const c = await prisma.client.findFirst({ where: { id: clientId, agencyId: user.agencyId }, select: { mutedAlertTypes: true } });
  if (!c) return;
  if (!c.mutedAlertTypes.includes(type as AlertType)) {
    await prisma.client.update({ where: { id: clientId }, data: { mutedAlertTypes: { set: [...c.mutedAlertTypes, type as AlertType] } } });
  }
  await prisma.alert.updateMany({ where: { clientId, agencyId: user.agencyId, type: type as AlertType, status: { in: ["OPEN", "ACKNOWLEDGED"] } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  revalidatePath("/insights");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/", "layout");
}

export async function unmuteAlertType(clientId: string, type: string): Promise<void> {
  const user = await requireAgencyStaff();
  if (!(await userCanEditClient(user, clientId))) return;
  const c = await prisma.client.findFirst({ where: { id: clientId, agencyId: user.agencyId }, select: { mutedAlertTypes: true } });
  if (!c) return;
  await prisma.client.update({ where: { id: clientId }, data: { mutedAlertTypes: { set: c.mutedAlertTypes.filter((t) => t !== type) } } });
  revalidatePath(`/clients/${clientId}`);
}
