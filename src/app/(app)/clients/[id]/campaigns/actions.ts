"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireClientEdit } from "@/server/access";
import { CampaignSelectionError, setAllCampaignsIncluded, setCampaignIncluded, setIncludeNewCampaigns } from "@/server/campaign-selection";

function done(clientId: string, notice: string): never {
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/dashboard");
  redirect(`/clients/${clientId}/campaigns?notice=${encodeURIComponent(notice)}`);
}

async function guarded(clientId: string, fn: (agencyId: string) => Promise<string>): Promise<never> {
  const user = await requireClientEdit(clientId);
  let notice: string;
  try {
    notice = await fn(user.agencyId);
  } catch (e) {
    if (!(e instanceof CampaignSelectionError)) throw e;
    redirect(`/clients/${clientId}/campaigns?error=${encodeURIComponent(e.message)}`);
  }
  done(clientId, notice);
}

export async function setCampaignIncludedAction(clientId: string, campaignId: string, included: boolean): Promise<void> {
  await guarded(clientId, async (agencyId) => {
    const name = await setCampaignIncluded(agencyId, clientId, campaignId, included);
    return included ? `${name} is back in this client's reports.` : `${name} was removed from this client's reports.`;
  });
}

export async function setAllCampaignsIncludedAction(clientId: string, accountId: string, included: boolean): Promise<void> {
  await guarded(clientId, async (agencyId) => {
    const n = await setAllCampaignsIncluded(agencyId, clientId, accountId, included);
    const s = n === 1 ? "campaign" : "campaigns";
    return included ? `Added back ${n} ${s}.` : `Removed ${n} ${s}.${n ? " Campaigns with their own budget were kept." : ""}`;
  });
}

export async function setIncludeNewCampaignsAction(clientId: string, accountId: string, value: boolean): Promise<void> {
  await guarded(clientId, async (agencyId) => {
    await setIncludeNewCampaigns(agencyId, clientId, accountId, value);
    return value ? "New campaigns in this account will be added to reports automatically." : "New campaigns in this account will start out removed until you add them.";
  });
}
