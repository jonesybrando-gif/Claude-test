"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireAdmin, requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { evaluateAgencyAlerts } from "@/server/alerts";

export async function acknowledgeAlert(alertId: string): Promise<void> {
  const user = await requireAgencyStaff();
  const clients = await prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true } });
  await prisma.alert.updateMany({
    where: { id: alertId, agencyId: user.agencyId, status: "OPEN", clientId: { in: clients.map((c) => c.id) } },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id },
  });
  revalidatePath("/alerts");
}

export async function checkAlertsNow(): Promise<string> {
  const admin = await requireAdmin();
  const r = await evaluateAgencyAlerts(admin.agencyId);
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
  return `${r.created} new, ${r.refreshed} still open, ${r.resolved} resolved.`;
}

/** Acknowledge or snooze the selected alerts (from the bulk bar). */
export async function bulkAlertAction(form: FormData): Promise<void> {
  const user = await requireAgencyStaff();
  const ids = form.getAll("alert").map(String);
  const mode = String(form.get("mode") ?? "");
  if (!ids.length) return;
  const clients = await prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true } });
  const where = { id: { in: ids }, agencyId: user.agencyId, clientId: { in: clients.map((c) => c.id) }, status: { not: "RESOLVED" as const } };
  if (mode === "ack") {
    await prisma.alert.updateMany({ where: { ...where, status: "OPEN" }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id } });
  } else if (mode === "snooze1" || mode === "snooze7") {
    await prisma.alert.updateMany({ where, data: { snoozedUntil: new Date(Date.now() + (mode === "snooze1" ? 1 : 7) * 86_400_000) } });
  } else if (mode === "unsnooze") {
    await prisma.alert.updateMany({ where, data: { snoozedUntil: null } });
  }
  revalidatePath("/alerts");
  revalidatePath("/", "layout");
}
