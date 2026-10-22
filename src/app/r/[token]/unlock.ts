"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveShareToken } from "@/server/share-links";
import { shareCookieName, shareCookieValue } from "@/server/share-access";
import { recordFailedSignIn, signInLockRemaining } from "@/server/login-throttle";
import { clientIp } from "@/lib/login-throttle";

export type UnlockState = { error?: string } | undefined;

/** Checks a shared report's password and remembers it in this browser for 30 days. */
export async function unlockShareAction(token: string, _prev: UnlockState, form: FormData): Promise<UnlockState> {
  const link = await resolveShareToken(token);
  if (!link?.passwordHash) redirect(`/r/${token}`);
  // Same throttle as sign-in, keyed to this link and the visitor's address.
  const key = `share-link:${link.id}`;
  const ip = clientIp(await headers());
  const wait = await signInLockRemaining(key, ip);
  if (wait > 0) return { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.` };
  if (!(await bcrypt.compare(String(form.get("password") ?? ""), link.passwordHash))) {
    await recordFailedSignIn(key, ip);
    return { error: "That password isn't right." };
  }
  (await cookies()).set(shareCookieName(link.id), shareCookieValue(link.id, link.passwordHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/r/${token}`,
    maxAge: 30 * 86_400,
  });
  redirect(`/r/${token}`);
}
