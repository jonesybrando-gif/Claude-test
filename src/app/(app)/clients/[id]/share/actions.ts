"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { createShareLink, SHARE_RANGES, type ShareRange } from "@/server/share-links";

export type CreateLinkState = { url?: string; error?: string; n?: number } | undefined;
const EXPIRY_DAYS = new Set(["7", "30", "90", "365", "never"]);

export async function createShareLinkAction(clientId: string, prev: CreateLinkState, form: FormData): Promise<CreateLinkState> {
  const user = await requireClientEdit(clientId);
  const range = String(form.get("range") ?? "template") as ShareRange;
  const expiry = String(form.get("expiry") ?? "90");
  const label = String(form.get("label") ?? "").trim().slice(0, 80) || null;
  if (!SHARE_RANGES.includes(range)) return { error: "Choose a date range." };
  if (!EXPIRY_DAYS.has(expiry)) return { error: "Choose when the link expires." };
  const { url } = await createShareLink({ clientId, createdById: user.id, label, range, expiresInDays: expiry === "never" ? null : Number(expiry) });
  revalidatePath(`/clients/${clientId}/share`);
  return { url, n: (prev?.n ?? 0) + 1 };
}

export async function revokeShareLinkAction(clientId: string, linkId: string): Promise<void> {
  await requireClientEdit(clientId);
  // Scoped to the client so a link id from another client can't be revoked through this one.
  await prisma.reportShareLink.updateMany({ where: { id: linkId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath(`/clients/${clientId}/share`);
}
