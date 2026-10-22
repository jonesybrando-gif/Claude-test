import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Password-protected share links: after the right password, the browser gets
// a cookie scoped to that link. Its value is an HMAC of the link id and the
// password hash, so changing the password or the server secret invalidates it.

export const shareCookieName = (linkId: string) => `mn_share_${linkId}`;

export function shareCookieValue(linkId: string, passwordHash: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`${linkId}:${passwordHash}`).digest("base64url");
}

/** True when the link has no password, or the cookie proves it was entered. */
export function hasShareAccess(link: { id: string; passwordHash: string | null }, cookieValue: string | undefined): boolean {
  if (!link.passwordHash) return true;
  if (!cookieValue) return false;
  const expected = Buffer.from(shareCookieValue(link.id, link.passwordHash));
  const got = Buffer.from(cookieValue);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
