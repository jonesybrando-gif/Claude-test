"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { appUrl, sendEmail } from "@/server/email";
import { assertIsoDate, isoToDate } from "@/lib/pacing/dates";
import { formatDate } from "@/lib/time";

export type NoteState = { ok?: string; error?: string; n?: number } | undefined;

/** Adds a dated note to the client's charts; optionally tags a teammate, who is emailed. */
export async function addChartNoteAction(clientId: string, prev: NoteState, form: FormData): Promise<NoteState> {
  const user = await requireClientEdit(clientId);
  const date = String(form.get("date") ?? "");
  const text = String(form.get("text") ?? "").trim();
  try {
    assertIsoDate(date);
  } catch {
    return { error: "Choose a date." };
  }
  if (!text) return { error: "Write the note." };
  if (text.length > 500) return { error: "Keep notes to 500 characters." };
  const taggedId = String(form.get("tag") ?? "") || null;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, agencyId: true } });
  const tagged = taggedId
    ? await prisma.user.findFirst({ where: { id: taggedId, agencyId: client.agencyId, deactivatedAt: null, role: { in: ["AGENCY_ADMIN", "ACCOUNT_MANAGER"] } }, select: { id: true, email: true, name: true } })
    : null;
  await prisma.chartNote.create({ data: { clientId, date: isoToDate(date), text, clientVisible: form.get("clientVisible") === "on", authorId: user.id, taggedUserId: tagged?.id ?? null } });
  if (tagged && tagged.id !== user.id) {
    const link = appUrl(`/clients/${clientId}?tab=paid`);
    await sendEmail({
      agencyId: client.agencyId,
      to: tagged.email,
      kind: "note_mention",
      replyTo: user.email,
      subject: `${user.name} tagged you on ${client.name}`,
      text: `${user.name} added a note to ${client.name} for ${formatDate(date, { month: "short", day: "numeric", year: "numeric" })}:\n\n${text}\n\nOpen: ${link}`,
    });
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: tagged ? `Note added and ${tagged.name} was emailed.` : "Note added.", n: (prev?.n ?? 0) + 1 };
}

export async function deleteChartNoteAction(clientId: string, noteId: string): Promise<void> {
  await requireClientEdit(clientId);
  await prisma.chartNote.deleteMany({ where: { id: noteId, clientId } });
  revalidatePath(`/clients/${clientId}`);
}
