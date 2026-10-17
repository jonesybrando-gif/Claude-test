import "server-only";
import { prisma } from "../db";
import { decryptSecret, encryptSecret } from "../crypto";
import { IntegrationError } from "./errors";
import type { OAuthTokens, PlatformAdapter } from "./types";

const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export async function storeTokens(connectionId: string, tokens: OAuthTokens): Promise<void> {
  const data = {
    encryptedAccessToken: encryptSecret(tokens.accessToken),
    accessTokenExpiresAt: tokens.expiresAt ?? null,
    scopes: tokens.scopes ?? null,
    // Google omits the refresh token on refresh responses; keep the existing one.
    ...(tokens.refreshToken ? { encryptedRefreshToken: encryptSecret(tokens.refreshToken) } : {}),
  };
  await prisma.oAuthCredential.upsert({ where: { connectionId }, create: { connectionId, ...data }, update: data });
}

/**
 * A valid access token for a connection, refreshing it when it is about to
 * expire (or when `force` is set after a 401). Marks the connection as
 * NEEDS_REAUTH if the refresh token has been revoked.
 */
export async function getAccessToken(connectionId: string, adapter: PlatformAdapter, opts: { force?: boolean } = {}): Promise<string> {
  const cred = await prisma.oAuthCredential.findUnique({ where: { connectionId } });
  if (!cred?.encryptedRefreshToken) {
    throw new IntegrationError("AUTH_REVOKED", "No stored authorization for this connection. Reconnect it.");
  }
  const fresh = cred.encryptedAccessToken && cred.accessTokenExpiresAt && cred.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;
  if (fresh && !opts.force) return decryptSecret(cred.encryptedAccessToken!);
  try {
    const tokens = await adapter.refresh(decryptSecret(cred.encryptedRefreshToken));
    await storeTokens(connectionId, tokens);
    return tokens.accessToken;
  } catch (e) {
    if (e instanceof IntegrationError && e.kind === "AUTH_REVOKED") {
      await markConnectionNeedsReauth(connectionId, e.message);
    }
    throw e;
  }
}

export async function markConnectionNeedsReauth(connectionId: string, message: string): Promise<void> {
  await prisma.$transaction([
    prisma.platformConnection.update({ where: { id: connectionId }, data: { status: "NEEDS_REAUTH", lastError: message } }),
    prisma.adAccount.updateMany({ where: { connectionId }, data: { status: "NEEDS_REAUTH" } }),
  ]);
}

/** Runs `fn` with an access token; on a 401 it force-refreshes once and retries. */
export async function withAccessToken<T>(connectionId: string, adapter: PlatformAdapter, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken(connectionId, adapter);
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof IntegrationError && e.kind === "AUTH_REVOKED" && e.status === 401) {
      const retryToken = await getAccessToken(connectionId, adapter, { force: true });
      return fn(retryToken);
    }
    throw e;
  }
}
