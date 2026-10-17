"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { createSession, requireUser } from "@/server/auth";
import { passwordProblems } from "@/lib/password";

export type AccountState = { ok?: string; errors?: string[] } | undefined;

export async function changePassword(_prev: AccountState, form: FormData): Promise<AccountState> {
  const me = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) return { errors: ["Your current password is incorrect."] };
  const problems = passwordProblems(next, user.email);
  if (next !== String(form.get("confirm") ?? "")) problems.push("The new passwords don't match.");
  if (next === current) problems.push("Choose a password different from your current one.");
  if (problems.length) return { errors: problems };
  await prisma.user.update({
    where: { id: me.id },
    // Signs out every other session; this browser gets a fresh one below.
    data: { passwordHash: await bcrypt.hash(next, 12), sessionsValidAfter: new Date(Math.floor(Date.now() / 1000) * 1000) },
  });
  await createSession(me.id);
  return { ok: "Password changed. Other devices have been signed out." };
}

export async function saveProfile(_prev: AccountState, form: FormData): Promise<AccountState> {
  const me = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 120) return { errors: ["Enter your name."] };
  const staff = me.role !== "CLIENT_USER";
  await prisma.user.update({
    where: { id: me.id },
    data: { name, ...(staff ? { emailAlerts: form.get("emailAlerts") === "on", dailySummary: form.get("dailySummary") === "on" } : {}) },
  });
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}
