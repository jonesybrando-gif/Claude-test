"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { getDataSourceAdapter } from "@/server/data-sources/registry";
import { dataSourceAccessToken, readSecret } from "@/server/data-sources/credentials";
import { syncDataAsset } from "@/server/data-sources/sync";
import type { RemoteAsset } from "@/server/data-sources/types";

// Shared by every data-source provider (Google, CallRail, Meta organic, …).

export type LinkAssetsState = { ok?: string; errors?: string[] } | undefined;

/**
 * Link remote assets to clients. Form fields `client:<KIND>:<externalId>` =
 * clientId, or "" for "Don't monitor" (status DISCONNECTED; data kept).
 * Only assets the connection can reach (re-listed from the API) or already
 * linked through it are accepted.
 */
export async function linkDataAssets(connectionId: string, _prev: LinkAssetsState, form: FormData): Promise<LinkAssetsState> {
  const user = await requireAdmin();
  const connection = await prisma.dataSourceConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId } });
  if (!connection) return { errors: ["Connection not found."] };
  if (connection.status === "DISCONNECTED") return { errors: ["This connection is disconnected. Connect again first."] };
  const adapter = getDataSourceAdapter(connection.provider);
  if (!adapter) return { errors: ["This data source is not available yet."] };

  let remote: RemoteAsset[];
  try {
    const accessToken = await dataSourceAccessToken(connection, adapter);
    remote = await adapter.listAssets({ connection, accessToken, secret: readSecret(connection) });
  } catch (e) {
    return { errors: [`Could not list assets: ${(e as Error).message}`] };
  }
  const clients = new Set((await prisma.client.findMany({ where: { agencyId: user.agencyId, archivedAt: null }, select: { id: true } })).map((c) => c.id));
  const key = (kind: string, id: string) => `${kind}:${id}`;
  const remoteKeys = new Set(remote.map((a) => key(a.kind, a.externalId)));
  // Assets linked through this connection that it can no longer see may still be unlinked.
  const orphans = await prisma.dataAsset.findMany({ where: { connectionId: connection.id, status: { not: "DISCONNECTED" } }, select: { kind: true, externalId: true } });

  const toSync: string[] = [];
  let unlinked = 0;
  let unchanged = 0;

  const stop = async (where: Prisma.DataAssetWhereInput) => {
    const r = await prisma.dataAsset.updateMany({ where: { ...where, status: { not: "DISCONNECTED" } }, data: { status: "DISCONNECTED" } });
    return r.count;
  };

  for (const o of orphans) {
    if (remoteKeys.has(key(o.kind, o.externalId))) continue;
    if (form.get(`client:${o.kind}:${o.externalId}`) === "") unlinked += await stop({ connectionId: connection.id, kind: o.kind, externalId: o.externalId });
  }

  for (const a of remote) {
    const field = form.get(`client:${a.kind}:${a.externalId}`);
    if (field === null) continue; // not on the form
    const clientId = String(field);
    const sameAsset: Prisma.DataAssetWhereInput = { kind: a.kind, externalId: a.externalId, client: { agencyId: user.agencyId } };
    if (!clientId) {
      unlinked += await stop(sameAsset);
      continue;
    }
    if (!clients.has(clientId)) return { errors: ["Unknown client selected."] };
    // Moving to another client: the old link stops (its history stays with the old client).
    unlinked += await stop({ ...sameAsset, clientId: { not: clientId } });
    const existing = await prisma.dataAsset.findUnique({ where: { kind_externalId_clientId: { kind: a.kind, externalId: a.externalId, clientId } } });
    const data = {
      connectionId: connection.id,
      name: a.name,
      timezone: a.timezone ?? null,
      settings: (a.settings ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    if (existing && existing.status === "ACTIVE" && existing.connectionId === connection.id) {
      if (existing.name !== a.name || existing.timezone !== data.timezone) await prisma.dataAsset.update({ where: { id: existing.id }, data });
      unchanged++;
      continue;
    }
    const row = existing
      ? await prisma.dataAsset.update({ where: { id: existing.id }, data: { ...data, status: "ACTIVE", lastError: null } })
      : await prisma.dataAsset.create({ data: { ...data, clientId, kind: a.kind, externalId: a.externalId } });
    toSync.push(row.id);
  }

  // History import runs after the response is sent.
  if (toSync.length) {
    after(async () => {
      for (const id of toSync) await syncDataAsset(id).catch((e) => console.error("[data-sources] initial sync failed", id, (e as Error)?.message));
    });
  }
  revalidatePath("/integrations", "layout");
  const parts = [
    toSync.length ? `Linked ${toSync.length}; history is importing in the background, so refresh in a few minutes.` : "",
    unlinked ? `Stopped monitoring ${unlinked}; their data is kept.` : "",
  ].filter(Boolean);
  return { ok: parts.join(" ") || (unchanged ? "No changes." : "Nothing selected.") };
}

/**
 * Disconnect a data-source login. Tokens are deleted here but never revoked at
 * the provider: the same Google login may also back a Google Ads connection.
 * Linked assets pause (data kept) and resume when the same login reconnects.
 */
export async function disconnectDataSource(connectionId: string): Promise<void> {
  const user = await requireAdmin();
  const connection = await prisma.dataSourceConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId }, select: { id: true } });
  if (!connection) throw new Error("Connection not found");
  await prisma.$transaction([
    prisma.dataSourceConnection.update({
      where: { id: connection.id },
      data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null, encryptedSecret: null, lastError: null },
    }),
    prisma.dataAsset.updateMany({ where: { connectionId: connection.id, status: "ACTIVE" }, data: { status: "NEEDS_REAUTH", lastError: "The login was disconnected." } }),
  ]);
  revalidatePath("/integrations", "layout");
}
