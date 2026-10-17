import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenType } from "@prisma/client";
import { prisma } from "./db";

export const INVITE_TTL_HOURS = 72;
export const RESET_TTL_MINUTES = 60;

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Creates a single-use token, revoking earlier unused tokens of the same type. Returns the raw token (only ever placed in a link). */
export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const ttlMs = type === "INVITE" ? INVITE_TTL_HOURS * 3_600_000 : RESET_TTL_MINUTES * 60_000;
  await prisma.$transaction([
    prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.authToken.create({ data: { userId, type, tokenHash: hash(raw), expiresAt: new Date(Date.now() + ttlMs) } }),
  ]);
  return raw;
}

/** The token's user if the token is valid (right type, unused, unexpired, user active). Does not consume it. */
export async function peekAuthToken(raw: string, type: AuthTokenType) {
  if (!raw || raw.length < 20) return null;
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) }, include: { user: true } });
  if (!t || t.type !== type || t.usedAt || t.expiresAt < new Date() || t.user.deactivatedAt) return null;
  return t;
}

/** Atomically marks a valid token used and returns its user id, or null. */
export async function consumeAuthToken(raw: string, type: AuthTokenType): Promise<string | null> {
  const t = await peekAuthToken(raw, type);
  if (!t) return null;
  const { count } = await prisma.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? t.userId : null;
}
