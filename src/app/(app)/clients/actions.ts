"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { archiveClient, ClientAdminError, createLabel, deleteClientPermanently, deleteLabel, restoreClient, setClientLabels } from "@/server/client-admin";

export type ClientFormState = { errors?: string[] } | undefined;

const schema = z.object({
  name: z.string().trim().min(1, "Enter a client name").max(120),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone"),
  managerId: z.string().optional(),
});

export async function createClient(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const user = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const managerId = parsed.data.managerId
    ? (await prisma.user.findFirst({ where: { id: parsed.data.managerId, agencyId: user.agencyId, role: "ACCOUNT_MANAGER" } }))?.id ?? null
    : null;
  const client = await prisma.client.create({
    data: {
      agencyId: user.agencyId,
      name: parsed.data.name,
      timezone: parsed.data.timezone,
      primaryManagerId: managerId,
      assignments: managerId ? { create: [{ userId: managerId }] } : undefined,
    },
  });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

// --- Removing clients and labels -------------------------------------------

function back(notice: { notice?: string; error?: string }, view?: string): never {
  const q = new URLSearchParams();
  if (view) q.set("view", view);
  if (notice.notice) q.set("notice", notice.notice);
  if (notice.error) q.set("error", notice.error);
  revalidatePath("/", "layout");
  redirect(`/clients?${q}`);
}

async function run(fn: (agencyId: string) => Promise<string>, view?: string): Promise<never> {
  const user = await requireAdmin();
  let message: string;
  try {
    message = await fn(user.agencyId);
  } catch (e) {
    if (e instanceof ClientAdminError) back({ error: e.message }, view);
    throw e;
  }
  back({ notice: message }, view);
}

export async function removeClientAction(clientId: string): Promise<void> {
  await run(async (agencyId) => `${await archiveClient(agencyId, clientId)} was removed. You can restore it from Removed clients.`);
}

export async function restoreClientAction(clientId: string): Promise<void> {
  await run(async (agencyId) => `${await restoreClient(agencyId, clientId)} was restored. Link its ad accounts again under Ad accounts.`, "removed");
}

export async function deleteClientAction(clientId: string): Promise<void> {
  await run(async (agencyId) => `${await deleteClientPermanently(agencyId, clientId)} and all its data were deleted.`, "removed");
}

export async function createLabelAction(form: FormData): Promise<void> {
  await run(async (agencyId) => `Label “${(await createLabel(agencyId, String(form.get("name") ?? ""), String(form.get("color") ?? "neutral"))).name}” created.`);
}

export async function deleteLabelAction(labelId: string): Promise<void> {
  await run(async (agencyId) => {
    await deleteLabel(agencyId, labelId);
    return "Label deleted. Clients that had it keep everything else.";
  });
}

export async function setClientLabelsAction(clientId: string, form: FormData): Promise<void> {
  const user = await requireAdmin();
  await setClientLabels(user.agencyId, clientId, form.getAll("label").map(String));
  revalidatePath("/", "layout");
}
