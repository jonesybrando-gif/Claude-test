import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { appUrl } from "./email";

// Shared report links: anyone with the link can view one client's
// client-facing report until it expires or is revoked. Tokens carry 192 bits
// of randomness and are looked up by hash, so the database alone can't be
// used to open a report.

export const SHARE_RANGES = ["template", "mtd", "last_month", "last_7", "last_30", "last_90"] as const;
export type ShareRange = (typeof SHARE_RANGES)[number];

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export const shareUrl = (token: string) => appUrl(`/r/${token}`);

export async function createShareLink(opts: { clientId: string; createdById: string; label: string | null; range: ShareRange; expiresInDays: number | null; now?: Date }) {
  const token = randomBytes(24).toString("base64url");
  const now = opts.now ?? new Date();
  const link = await prisma.reportShareLink.create({
    data: {
      clientId: opts.clientId,
      tokenHash: hash(token),
      tokenEnc: encryptSecret(token),
      label: opts.label,
      range: opts.range === "template" ? null : opts.range,
      expiresAt: opts.expiresInDays ? new Date(now.getTime() + opts.expiresInDays * 86_400_000) : null,
      createdById: opts.createdById,
    },
  });
  return { link, token, url: shareUrl(token) };
}

/** The live link for a token, or null if it's unknown, revoked, expired, or the client is archived. */
export async function resolveShareToken(token: string, now: Date = new Date()) {
  if (!TOKEN_RE.test(token)) return null;
  const link = await prisma.reportShareLink.findUnique({ where: { tokenHash: hash(token) }, include: { client: { select: { id: true, agencyId: true, archivedAt: true, name: true } } } });
  if (!link || link.revokedAt || link.client.archivedAt) return null;
  if (link.expiresAt && link.expiresAt <= now) return null;
  return link;
}

export async function recordShareView(id: string) {
  await prisma.reportShareLink.update({ where: { id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } });
}

/** Links for the share page, newest first, with their URLs. */
export async function listShareLinks(clientId: string) {
  const links = await prisma.reportShareLink.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  return links.map((l) => {
    let url: string | null = null;
    try {
      url = shareUrl(decryptSecret(l.tokenEnc));
    } catch {
      url = null; // encryption key changed; the link still works but can't be shown again
    }
    const { tokenEnc: _enc, tokenHash: _hash, ...rest } = l; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, url };
  });
}
