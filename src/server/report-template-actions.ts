"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireClientEdit } from "./access";
import { prisma } from "./db";
import { getClientTemplate, resetClientTemplate, saveTemplate } from "./report-templates";
import { parseKpiOrder, SECTION_KEYS, templateFromForm, withKpis, type SectionKey } from "@/lib/report-template";
import { isClientGoal } from "@/lib/results";

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

/** Shows or hides one section of a client's client-facing report (e.g. the executive summary). */
export async function setSectionVisibilityAction(clientId: string, section: SectionKey, visible: boolean): Promise<void> {
  const user = await requireClientEdit(clientId);
  if (!SECTION_KEYS.includes(section)) return;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { agencyId: true } });
  if (client.agencyId !== user.agencyId) return;
  const { template } = await getClientTemplate(client.agencyId, clientId);
  await saveTemplate(client.agencyId, clientId, { ...template, sections: { ...template.sections, [section]: visible } });
  revalidatePath(`/clients/${clientId}`, "layout");
}

export type SaveKpisResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the KPI tiles arranged inline on the client page. Replaces only the
 * template's `kpis`; title, sections, trends and the rest stay as they are.
 * Same permission check as saving the whole template.
 */
export async function saveClientKpisAction(clientId: string, kpis: unknown): Promise<SaveKpisResult> {
  const user = await requireClientEdit(clientId);
  const parsed = parseKpiOrder(kpis);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { agencyId: true } });
  if (client.agencyId !== user.agencyId) return { ok: false, error: "Client not found." };
  const { template } = await getClientTemplate(client.agencyId, clientId);
  await saveTemplate(client.agencyId, clientId, withKpis(template, parsed.kpis));
  // The client page (Overview), its PDF route and shared links all read the saved template.
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/r/[token]", "page");
  return { ok: true };
}

export type GoalFormState = { ok?: string; error?: string } | undefined;

/**
 * Sets what the client wants from advertising (Client.goal), which decides the
 * Results figure on the report. An empty value means "let Marketing Nexus
 * decide" (null: guessed from the data). Same permission check as the template.
 */
export async function saveClientGoalAction(clientId: string, _prev: GoalFormState, form: FormData): Promise<GoalFormState> {
  const user = await requireClientEdit(clientId);
  const raw = String(form.get("goal") ?? "");
  if (raw !== "" && !isClientGoal(raw)) return { error: "Choose one of the options." };
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { agencyId: true } });
  if (client.agencyId !== user.agencyId) return { error: "Client not found." };
  await prisma.client.update({ where: { id: clientId }, data: { goal: raw === "" ? null : raw } });
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/r/[token]", "page");
  return { ok: raw === "" ? "Saved. Marketing Nexus will choose from the data." : "Saved. The report now counts results for this goal." };
}
