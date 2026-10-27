"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { syncDataAsset } from "@/server/data-sources/sync";
import { agencyDataForSeoConnection } from "@/server/data-sources/dataforseo/account";
import { activeKeywordTexts, clientRankProject, mergeRankSettings, reconcileKeywordRows } from "@/server/data-sources/dataforseo/projects";
import { MAX_KEYWORDS_PER_CLIENT, normalizeDomain, parseKeywordList, type RankDeviceSetting } from "@/lib/rankings";

export type RankFormState = { ok?: string; errors?: string[] } | undefined;

/** Run a rank sync after the response (posts today's checks for new keywords). */
function syncSoon(assetId: string) {
  after(async () => {
    await syncDataAsset(assetId).catch(() => undefined);
  });
}

/** Create or update the client's rank project: domain, location and device. */
export async function saveRankProject(clientId: string, _prev: RankFormState, form: FormData): Promise<RankFormState> {
  const user = await requireClientEdit(clientId);
  const domain = normalizeDomain(String(form.get("domain") ?? ""));
  if (!domain) return { errors: ["Enter the website's domain, e.g. example.com."] };
  const locSel = String(form.get("location") ?? "");
  const locationCode = Number(locSel === "custom" ? form.get("customLocation") : locSel);
  if (!Number.isInteger(locationCode) || locationCode < 1000 || locationCode > 99_999_999) return { errors: ["Choose a location or enter a DataForSEO location code (e.g. 2840 for the United States)."] };
  const d = String(form.get("device") ?? "desktop");
  const device: RankDeviceSetting = d === "mobile" || d === "both" ? d : "desktop";
  const languageCode = /^[a-z]{2}(-[a-z]{2,4})?$/i.test(String(form.get("language") ?? "")) ? String(form.get("language")).toLowerCase() : "en";

  const connection = await agencyDataForSeoConnection(user.agencyId);
  if (!connection) return { errors: ["DataForSEO isn't connected. An administrator can connect it in Settings › Connections."] };
  const next = { locationCode, languageCode, device, searchEngine: "google" as const };
  const existing = await clientRankProject(clientId);
  const asset = existing
    ? await prisma.dataAsset.update({
        where: { id: existing.id },
        data: { externalId: domain, name: `Rankings: ${domain}`, connectionId: connection.id, settings: mergeRankSettings(existing.settings, next) },
      })
    : await prisma.dataAsset.create({
        data: { clientId, kind: "RANK_PROJECT", externalId: domain, name: `Rankings: ${domain}`, connectionId: connection.id, settings: next },
      });
  if (existing) await reconcileKeywordRows(asset, await activeKeywordTexts(existing.id));
  syncSoon(asset.id);
  revalidatePath(`/clients/${clientId}/rankings`);
  return { ok: existing ? "Saved. Changes apply from the next daily check." : "Rank tracking set up. Add keywords below." };
}

/** Add keywords (one per line). Capped at MAX_KEYWORDS_PER_CLIENT distinct keywords. */
export async function addKeywords(clientId: string, _prev: RankFormState, form: FormData): Promise<RankFormState> {
  await requireClientEdit(clientId);
  const asset = await clientRankProject(clientId);
  if (!asset) return { errors: ["Set up the domain and location first."] };
  const incoming = parseKeywordList(String(form.get("keywords") ?? ""));
  if (!incoming.length) return { errors: ["Enter at least one keyword, one per line."] };
  const current = await activeKeywordTexts(asset.id);
  const have = new Set(current);
  const fresh = incoming.filter((k) => !have.has(k));
  if (!fresh.length) return { ok: "Those keywords are already tracked." };
  const room = MAX_KEYWORDS_PER_CLIENT - current.length;
  if (room <= 0) return { errors: [`This client already tracks ${MAX_KEYWORDS_PER_CLIENT} keywords, the limit. Remove some first.`] };
  const added = fresh.slice(0, room);
  await reconcileKeywordRows(asset, [...current, ...added]);
  syncSoon(asset.id);
  revalidatePath(`/clients/${clientId}/rankings`);
  const skipped = fresh.length - added.length;
  const dup = incoming.length - fresh.length;
  return {
    ok: [
      `Added ${added.length} keyword${added.length === 1 ? "" : "s"}; first positions appear within an hour or two.`,
      dup ? `${dup} already tracked.` : "",
      skipped ? `${skipped} not added: the limit is ${MAX_KEYWORDS_PER_CLIENT} per client.` : "",
    ].filter(Boolean).join(" "),
  };
}

/** Stop tracking a keyword and delete its history (all devices and locations). */
export async function removeKeyword(clientId: string, keyword: string): Promise<void> {
  await requireClientEdit(clientId);
  const asset = await clientRankProject(clientId);
  if (!asset) return;
  await prisma.trackedKeyword.deleteMany({ where: { assetId: asset.id, keyword } });
  revalidatePath(`/clients/${clientId}/rankings`);
}

/** Pause or resume daily checks for the client's project. */
export async function setRankProjectPaused(clientId: string, paused: boolean): Promise<void> {
  await requireClientEdit(clientId);
  const asset = await clientRankProject(clientId);
  if (!asset) return;
  await prisma.dataAsset.update({ where: { id: asset.id }, data: { status: paused ? "DISCONNECTED" : "ACTIVE" } });
  if (!paused) syncSoon(asset.id);
  revalidatePath(`/clients/${clientId}/rankings`);
}
