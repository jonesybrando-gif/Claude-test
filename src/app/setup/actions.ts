"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { createAuthToken } from "@/server/auth-tokens";
import { setupAvailable, setupTokenMatches } from "@/server/first-run";
import { recordFailedSignIn, signInLockRemaining } from "@/server/login-throttle";
import { slug } from "@/lib/csv";

export type SetupState = { error?: string } | undefined;

export async function createOwnerAction(_prev: SetupState, form: FormData): Promise<SetupState> {
  if (!(await setupAvailable())) return { error: "Setup is closed: an account already exists, or SETUP_TOKEN isn't set." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Wrong codes count against the same limits as wrong passwords.
  const throttleKey = "first-run-setup";
  if ((await signInLockRemaining(throttleKey, ip)) > 0) return { error: "Too many wrong setup codes. Try again later." };
  if (!setupTokenMatches(String(form.get("setupToken") ?? ""))) {
    await recordFailedSignIn(throttleKey, ip);
    return { error: "That setup code isn't right." };
  }
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const agencyName = String(form.get("agency") ?? "").trim().slice(0, 100);
  const timezone = String(form.get("timezone") ?? "America/New_York");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!name || !agencyName) return { error: "Enter your name and your agency's name." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { error: "Choose a valid time zone." };
  }
  const user = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) return null; // someone finished setup first
    const agency = await tx.agency.create({ data: { name: agencyName, slug: slug(agencyName) || "agency", defaultTimezone: timezone } });
    return tx.user.create({ data: { agencyId: agency.id, email, name, role: "AGENCY_ADMIN", passwordHash: null } });
  });
  if (!user) return { error: "Setup is closed: an account already exists." };
  // Same next step as an invitation: choose a password.
  const token = await createAuthToken(user.id, "INVITE");
  redirect(`/accept-invite?token=${token}`);
}
