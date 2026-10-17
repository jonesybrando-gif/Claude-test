"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireClientEdit } from "./access";
import { prisma } from "./db";
import { resetClientTemplate, saveTemplate } from "./report-templates";
import { templateFromForm } from "@/lib/report-template";

export type TemplateFormState = { ok?: string; errors?: string[] } | undefined;

export async function saveAgencyTemplateAction(_prev: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  const admin = await requireAdmin();
  const { template, problems } = templateFromForm(form);
  if (problems.length) return { errors: problems };
  await saveTemplate(admin.agencyId, null, template);
  revalidatePath("/settings/reports");
  revalidatePath("/clients", "layout");
  return { ok: "Saved. Clients without their own layout use this from now on." };
}

export async function saveClientTemplateAction(clientId: string, _prev: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  const user = await requireClientEdit(clientId);
  const { template, problems } = templateFromForm(form);
  if (problems.length) return { errors: problems };
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { agencyId: true } });
  if (client.agencyId !== user.agencyId) return { errors: ["Client not found."] };
  await saveTemplate(client.agencyId, clientId, template);
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: "Saved. The client page and PDF now use this layout." };
}

export async function resetClientTemplateAction(clientId: string): Promise<void> {
  const user = await requireClientEdit(clientId);
  await resetClientTemplate(user.agencyId, clientId);
  revalidatePath(`/clients/${clientId}`, "layout");
  // A fresh `reset` value remounts the form so it shows the agency default.
  redirect(`/clients/${clientId}/report?reset=${Date.now()}`);
}
