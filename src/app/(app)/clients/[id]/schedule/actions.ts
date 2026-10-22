"use server";

import { revalidatePath } from "next/cache";
import { requireClientEdit } from "@/server/access";
import { prisma } from "@/server/db";
import { saveSchedule, ScheduleError, sendScheduledReport } from "@/server/report-schedules";

export type ScheduleState = { ok?: string; error?: string } | undefined;

export async function saveScheduleAction(clientId: string, _prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const user = await requireClientEdit(clientId);
  try {
    const s = await saveSchedule(user.agencyId, clientId, {
      dayOfMonth: Number(form.get("dayOfMonth")),
      recipients: String(form.get("recipients") ?? ""),
      range: String(form.get("range") ?? "last_month"),
      attachPdf: form.get("attachPdf") === "on",
      includeLink: form.get("includeLink") === "on",
      active: form.get("active") === "on",
      userId: user.id,
    });
    revalidatePath(`/clients/${clientId}/schedule`);
    return { ok: s.active ? `Saved. Next send: ${s.nextRunAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}.` : "Saved. Scheduled sending is paused." };
  } catch (e) {
    if (e instanceof ScheduleError) return { error: e.message };
    throw e;
  }
}

/** Sends the report now, either to yourself (a test) or to the saved recipients. */
export async function sendNowAction(clientId: string, toSelf: boolean): Promise<ScheduleState> {
  const user = await requireClientEdit(clientId);
  const s = await prisma.clientReportSchedule.findUnique({ where: { clientId } });
  if (!s) return { error: "Save the schedule first." };
  try {
    const status = await sendScheduledReport(clientId, { to: toSelf ? [user.email] : undefined });
    if (!toSelf) await prisma.clientReportSchedule.update({ where: { clientId }, data: { lastSentAt: new Date(), lastStatus: status } });
    revalidatePath(`/clients/${clientId}/schedule`);
    return status.startsWith("Sent") ? { ok: toSelf ? `Test sent to ${user.email}.` : status } : { error: status };
  } catch (e) {
    console.error("send now failed", e);
    return { error: "Couldn't build or send the report. Try again." };
  }
}
