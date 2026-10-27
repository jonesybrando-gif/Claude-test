"use server";

import { revalidatePath } from "next/cache";
import { requireClientEdit } from "@/server/access";
import { setSummaryApproval } from "@/server/exec-summary";

export type ApprovalState = { error?: string } | undefined;

/** Approves (or withdraws) an AI-written summary for the client's reports. */
export async function approveSummaryAction(clientId: string, insightId: string, _prev: ApprovalState, form: FormData): Promise<ApprovalState> {
  const user = await requireClientEdit(clientId);
  const ok = await setSummaryApproval(clientId, insightId, user.id, form.get("approve") === "1");
  if (!ok) return { error: "That summary is no longer available. Refresh the page." };
  revalidatePath(`/clients/${clientId}`);
  return {};
}
