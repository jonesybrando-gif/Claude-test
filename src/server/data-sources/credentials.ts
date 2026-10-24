import "server-only";
import type { DataSourceConnection } from "@prisma/client";
import { prisma } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import type { DataSourceAdapter } from "./types";

const SKEW_MS = 2 * 60 * 1000;

export async function storeDataSourceTokens(connectionId: string, t: { accessToken: string; expiresAt?: Date | null; refreshToken?: string | null; scopes?: string | null }) {
  await prisma.dataSourceConnection.update({
    where: { id: connectionId },
    data: {
      encryptedAccessToken: encryptSecret(t.accessToken),
      accessTokenExpiresAt: t.expiresAt ?? null,
      ...(t.refreshToken ? { encryptedRefreshToken: encryptSecret(t.refreshToken) } : {}),
      ...(t.scopes !== undefined ? { scopes: t.scopes } : {}),
      status: "ACTIVE",
      lastError: null,
    },
  });
}

export async function storeDataSourceSecret(connectionId: string, secret: string) {
  await prisma.dataSourceConnection.update({ where: { id: connectionId }, data: { encryptedSecret: encryptSecret(secret), status: "ACTIVE", lastError: null } });
}

export function readSecret(c: DataSourceConnection): string | undefined {
  return c.encryptedSecret ? decryptSecret(c.encryptedSecret) : undefined;
}

/** Returns a valid access token, refreshing (and storing) it when it is about to expire. */
export async function dataSourceAccessToken(c: DataSourceConnection, adapter: DataSourceAdapter): Promise<string | undefined> {
  if (!c.encryptedAccessToken) return undefined;
  const fresh = c.accessTokenExpiresAt && c.accessTokenExpiresAt.getTime() - SKEW_MS > Date.now();
  if (fresh || !c.encryptedRefreshToken || !adapter.refreshAccessToken) return decryptSecret(c.encryptedAccessToken);
  const r = await adapter.refreshAccessToken(decryptSecret(c.encryptedRefreshToken));
  await storeDataSourceTokens(c.id, { accessToken: r.accessToken, expiresAt: r.expiresAt, refreshToken: r.refreshToken });
  return r.accessToken;
}

export async function markDataSourceNeedsReauth(connectionId: string, message: string) {
  await prisma.dataSourceConnection.update({ where: { id: connectionId }, data: { status: "NEEDS_REAUTH", lastError: message.slice(0, 500) } });
}
