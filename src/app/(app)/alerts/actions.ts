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
