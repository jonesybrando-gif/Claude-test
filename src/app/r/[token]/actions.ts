"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveShareToken, shareCookieName, unlockShareLink } from "@/server/share-links";
import { recordFailedSignIn, recordSuccessfulSignIn, signInLockRemaining } from "@/server/login-throttle";
import { clientIp } from "@/lib/login-throttle";

/** Checks a shared link's password and, if right, remembers it for 30 days on this browser. */
export async function unlockShareAction(token: string, _prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const link = await resolveShareToken(token);
  if (!link) return { error: "This link has expired or been turned off." };
  // Same throttling as sign-in, keyed to this link and the viewer's address.
  const key = `share-link:${link.id}`;
  const ip = clientIp(await headers());
  const locked = await signInLockRemaining(key, ip);
  if (locked > 0) return { error: `Too many attempts. Try again in ${Math.ceil(locked / 60_000)} minutes.` };
  const value = await unlockShareLink(link, String(form.get("password") ?? ""));
  if (!value) {
    await recordFailedSignIn(key, ip);
    return { error: "That password isn't right." };
  }
  await recordSuccessfulSignIn(key, ip);
  (await cookies()).set(shareCookieName(link.id), value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/r/${token}`, maxAge: 30 * 86_400 });
  redirect(`/r/${token}`);
}
