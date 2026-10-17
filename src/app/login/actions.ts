"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { createSession, destroySession } from "@/server/auth";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  // Compare against a dummy hash when the user is missing so timing does not reveal accounts.
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !ok) return { error: "Incorrect email or password." };
  await createSession(user.id);
  redirect(user.role === "CLIENT_USER" && user.clientId ? `/clients/${user.clientId}` : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
