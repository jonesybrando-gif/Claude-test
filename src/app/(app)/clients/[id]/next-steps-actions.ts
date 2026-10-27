"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { assertIsoDate, isoToDate, todayInTimeZone } from "@/lib/pacing/dates";
import { claimsDone, draftFromRecommendation, insightFingerprint, isInsightState } from "@/lib/next-steps";

// Agency-only actions on AI recommendations and the next steps a client sees.
// Every action checks the user may edit this client.

export type StepState = { ok?: string; error?: string } | undefined;

const refresh = (clientId: string) => {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/insights");
};

/** Records what the agency did with one recommendation (reviewed, dismissed with a reason, reopened). */
export async function setInsightStatusAction(clientId: string, title: string, status: string, reason?: string): Promise<void> {
  const user = await requireClientEdit(clientId);
  if (!isInsightState(status)) throw new Error("Unknown status");
  const fingerprint = insightFingerprint(title);
  if (status === "NEW") {
    await prisma.insightStatus.deleteMany({ where: { clientId, fingerprint } });
  } else {
    await prisma.insightStatus.upsert({
      where: { clientId_fingerprint: { clientId, fingerprint } },
      create: { clientId, fingerprint, title: title.slice(0, 300), status, reason: reason?.slice(0, 300) ?? null, updatedById: user.id },
      update: { status, reason: reason?.slice(0, 300) ?? null, updatedById: user.id },
    });
  }
  refresh(clientId);
}

/** "Plan it": marks the recommendation planned and creates a draft next step the agency then edits and approves. */
export async function planRecommendationAction(clientId: string, title: string): Promise<void> {
  const user = await requireClientEdit(clientId);
  const fingerprint = insightFingerprint(title);
  await prisma.$transaction([
    prisma.insightStatus.upsert({
      where: { clientId_fingerprint: { clientId, fingerprint } },
      create: { clientId, fingerprint, title: title.slice(0, 300), status: "PLANNED", updatedById: user.id },
      update: { status: "PLANNED", updatedById: user.id },
    }),
    prisma.nextStep.create({ data: { clientId, text: draftFromRecommendation(title), status: "DRAFT", source: "recommendation", sourceText: title.slice(0, 500), createdById: user.id } }),
  ]);
  refresh(clientId);
}

/** Adds AI-written next steps (from the executive summary) as drafts. Nothing is shown to the client yet. */
export async function addDraftStepsAction(clientId: string, texts: string[]): Promise<void> {
  const user = await requireClientEdit(clientId);
  const existing = new Set((await prisma.nextStep.findMany({ where: { clientId }, select: { sourceText: true, text: true } })).flatMap((s) => [s.sourceText, s.text]));
  const fresh = texts.map((t) => t.trim()).filter((t) => t && !existing.has(t)).slice(0, 8);
  if (fresh.length) await prisma.nextStep.createMany({ data: fresh.map((t) => ({ clientId, text: t, status: "DRAFT", source: "ai_summary", sourceText: t, createdById: user.id })) });
  refresh(clientId);
}

/** Saves a step's wording and target date; with `approve`, makes it visible to the client as planned. */
export async function saveNextStepAction(clientId: string, stepId: string | null, prev: StepState, form: FormData): Promise<StepState> {
  const user = await requireClientEdit(clientId);
  const text = String(form.get("text") ?? "").trim();
  const target = String(form.get("target") ?? "").trim();
  const approve = form.get("intent") === "approve";
  if (!text) return { error: "Write the next step." };
  if (text.length > 400) return { error: "Keep it to 400 characters." };
  if (target) {
    try {
      assertIsoDate(target);
    } catch {
      return { error: "Choose a valid date." };
    }
  }
  const step = stepId ? await prisma.nextStep.findFirst({ where: { id: stepId, clientId } }) : null;
  if (stepId && !step) return { error: "That step no longer exists." };
  const willBeVisible = approve || step?.status === "PLANNED";
  if (willBeVisible && step?.status !== "DONE" && claimsDone(text)) {
    return { error: "This says the work is already finished. Reword it as a plan (for example “We'll…”), or mark the step done with the date it happened." };
  }
  const data = {
    text,
    targetDate: target ? isoToDate(target) : null,
    ...(approve && step?.status !== "DONE" ? { status: "PLANNED", approvedById: user.id, approvedAt: new Date() } : {}),
  };
  if (step) await prisma.nextStep.update({ where: { id: step.id }, data });
  else await prisma.nextStep.create({ data: { clientId, source: "manual", createdById: user.id, status: "DRAFT", ...data } });
  refresh(clientId);
  return { ok: approve ? "Approved: the client now sees this as planned." : "Saved." };
}

/** Only a person marks a step done, with the date it happened (today in the client's time zone by default). */
export async function markStepDoneAction(clientId: string, stepId: string, prev: StepState, form: FormData): Promise<StepState> {
  const user = await requireClientEdit(clientId);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { timezone: true } });
  const today = todayInTimeZone(client.timezone);
  const on = String(form.get("doneOn") ?? "").trim() || today;
  try {
    assertIsoDate(on);
  } catch {
    return { error: "Choose the date it was done." };
  }
  if (on > today) return { error: "A step can't be done in the future." };
  const res = await prisma.nextStep.updateMany({ where: { id: stepId, clientId, status: { in: ["PLANNED", "DRAFT"] } }, data: { status: "DONE", doneOn: isoToDate(on), doneById: user.id, approvedById: user.id, approvedAt: new Date() } });
  if (!res.count) return { error: "That step can't be marked done." };
  refresh(clientId);
  return { ok: "Marked done." };
}

export async function deleteNextStepAction(clientId: string, stepId: string): Promise<void> {
  await requireClientEdit(clientId);
  await prisma.nextStep.deleteMany({ where: { id: stepId, clientId } });
  refresh(clientId);
}
