"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createSession } from "@/server/auth";
import { consumeAuthToken, createAuthToken, peekAuthToken, RESET_TTL_MINUTES } from "@/server/auth-tokens";
import { appUrl, emailConfigured, sendEmail } from "@/server/email";
import { resetEmail } from "@/lib/email-templates";
import { passwordProblems } from "@/lib/password";

export type PasswordState = { ok?: string; errors?: string[] } | undefined;

/** Accept an invitation or complete a password reset, then sign the user in. */
export async function setPasswordWithToken(kind: "INVITE" | "PASSWORD_RESET", token: string, _prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const t = await peekAuthToken(token, kind);
  if (!t) return { errors: ["This link is invalid, expired or already used. Ask your administrator for a new one."] };
  const problems = passwordProblems(password, t.user.email);
  if (password !== confirm) problems.push("The passwords don't match.");
  if (problems.length) return { errors: problems };
  const userId = await consumeAuthToken(token, kind);
  if (!userId) return { errors: ["This link has just been used. Ask your administrator for a new one."] };
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12), sessionsValidAfter: new Date(Math.floor(now.getTime() / 1000) * 1000), lastLoginAt: now },
  });
  // Invalidate any other outstanding links for this user.
  await prisma.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  await createSession(userId);
  redirect("/");
}

const emailSchema = z.string().trim().toLowerCase().email();

/** Always answers the same way whether or not the email exists, so accounts can't be discovered. */
export async function requestPasswordReset(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { errors: ["Enter your email address."] };
  if (!emailConfigured()) return { errors: ["Email isn't set up for this workspace yet. Ask your administrator to send you a reset link from Settings → Team."] };
  const user = await prisma.user.findUnique({ where: { email: parsed.data }, include: { agency: true } });
  if (user && !user.deactivatedAt && user.passwordHash) {
    const token = await createAuthToken(user.id, "PASSWORD_RESET");
    const link = appUrl(`/reset-password?token=${token}`);
    const tpl = resetEmail({ name: user.agency.name, color: user.agency.brandColor, footer: user.agency.reportFooter }, link, RESET_TTL_MINUTES);
    await sendEmail({ agencyId: user.agencyId, to: user.email, kind: "password_reset", ...tpl, redact: [link] });
  }
  return { ok: "If that email belongs to an active account, a reset link is on its way. It expires in 60 minutes." };
}
