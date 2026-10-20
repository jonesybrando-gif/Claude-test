import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

// Which of an ad account's campaigns count for the client. A removed campaign
// is only left out of this app's reports, pacing and alerts: nothing changes
// in the ad account, and its data keeps syncing so it can be added back.

/** Daily rows that count: account-level rows, and rows of campaigns not removed. */
export const INCLUDED_ROWS: Prisma.DailyPerformanceWhereInput = { OR: [{ campaignId: null }, { campaign: { excludedAt: null } }] };

export class CampaignSelectionError extends Error {}

async function campaignForClient(agencyId: string, clientId: string, campaignId: string) {
  const c = await prisma.campaign.findFirst({
    where: { id: campaignId, account: { clientId, client: { agencyId } } },
    select: { id: true, name: true, _count: { select: { budgets: true } } },
  });
  if (!c) throw new CampaignSelectionError("Campaign not found.");
  return c;
}

export async function setCampaignIncluded(agencyId: string, clientId: string, campaignId: string, included: boolean): Promise<string> {
  const c = await campaignForClient(agencyId, clientId, campaignId);
  if (!included && c._count.budgets > 0) {
    throw new CampaignSelectionError(`${c.name} has its own budget. Delete that budget on the Budgets page before removing the campaign.`);
  }
  await prisma.campaign.update({ where: { id: c.id }, data: { excludedAt: included ? null : new Date() } });
  return c.name;
}

/** Adds back or removes every campaign in one account (campaigns with their own budget stay included). */
export async function setAllCampaignsIncluded(agencyId: string, clientId: string, accountId: string, included: boolean): Promise<number> {
  const where: Prisma.CampaignWhereInput = { accountId, account: { clientId, client: { agencyId } } };
  const res = included
    ? await prisma.campaign.updateMany({ where: { ...where, excludedAt: { not: null } }, data: { excludedAt: null } })
    : await prisma.campaign.updateMany({ where: { ...where, excludedAt: null, budgets: { none: {} } }, data: { excludedAt: new Date() } });
  return res.count;
}

export async function setIncludeNewCampaigns(agencyId: string, clientId: string, accountId: string, value: boolean): Promise<void> {
  const res = await prisma.adAccount.updateMany({ where: { id: accountId, clientId, client: { agencyId } }, data: { includeNewCampaigns: value } });
  if (res.count === 0) throw new CampaignSelectionError("Ad account not found.");
}
