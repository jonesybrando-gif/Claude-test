"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../db";
import { requireAdmin } from "../../access";
import { storeDataSourceSecret } from "../credentials";
import { CallRailError, normalizeCallRailKey, validateCallRailKey } from "./client";

// Admin-only actions for the CallRail card. The API key is validated with
// CallRail, encrypted via storeDataSourceSecret and never returned or logged.

export type CallRailKeyState = { ok?: string; error?: string } | undefined;

/**
 * Connect a CallRail key, or replace the key on an existing connection when
 * the form has `connectionId`. Form field: `apiKey`.
 */
export async function saveCallRailKey(_prev: CallRailKeyState, form: FormData): Promise<CallRailKeyState> {
  const user = await requireAdmin();
  const connectionId = String(form.get("connectionId") ?? "") || null;

  const key = normalizeCallRailKey(form.get("apiKey"));
  if (!key) return { error: "Paste a CallRail API key (letters and numbers only)." };
  let validated;
  try {
    validated = await validateCallRailKey(key);
  } catch (e) {
    return { error: e instanceof CallRailError ? e.message : "Couldn't check the key with CallRail. Try again." };
  }
  const label = validated.accounts.length > 1 ? `${validated.accountName} (+${validated.accounts.length - 1} more)` : validated.accountName;

  if (connectionId) {
    const existing = await prisma.dataSourceConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, provider: "CALLRAIL" } });
    if (!existing) return { error: "That CallRail connection no longer exists." };
    // Linked companies belong to the original account; a key for another account would break them.
    if (existing.externalId && !validated.accounts.some((a) => a.id === existing.externalId)) {
      return { error: `That key belongs to a different CallRail account (${validated.accountName}). Connect it as a new connection instead.` };
    }
    await prisma.dataSourceConnection.update({ where: { id: existing.id }, data: { label } });
    await storeDataSourceSecret(existing.id, key);
    revalidatePath("/integrations", "layout");
    return { ok: "API key updated." };
  }

  // Reconnecting an account that was connected before reuses its connection,
  // so previously linked companies resume syncing.
  const prior = await prisma.dataSourceConnection.findFirst({ where: { agencyId: user.agencyId, provider: "CALLRAIL", externalId: validated.accountId } });
  const connection = prior
    ? await prisma.dataSourceConnection.update({ where: { id: prior.id }, data: { label } })
    : await prisma.dataSourceConnection.create({ data: { agencyId: user.agencyId, provider: "CALLRAIL", label, externalId: validated.accountId, createdById: user.id } });
  await storeDataSourceSecret(connection.id, key);
  revalidatePath("/integrations", "layout");
  return { ok: prior ? `Reconnected ${validated.accountName}.` : `Connected ${validated.accountName}. Choose companies to link to clients.` };
}

/** Disconnect: deletes the stored key and stops syncing. Linked companies and their history are kept. */
export async function disconnectCallRail(connectionId: string): Promise<void> {
  const user = await requireAdmin();
  const existing = await prisma.dataSourceConnection.findFirst({ where: { id: connectionId, agencyId: user.agencyId, provider: "CALLRAIL" }, select: { id: true } });
  if (!existing) return;
  await prisma.dataSourceConnection.update({
    where: { id: existing.id },
    data: { encryptedSecret: null, encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null, status: "DISCONNECTED", lastError: null },
  });
  revalidatePath("/integrations", "layout");
}
