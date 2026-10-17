"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { createAuthToken, INVITE_TTL_HOURS, RESET_TTL_MINUTES } from "@/server/auth-tokens";
import { appUrl, sendEmail } from "@/server/email";
import { inviteEmail, resetEmail } from "@/lib/email-templates";
import { teamChangeProblem } from "@/lib/team-policy";

export type TeamState = { ok?: string; link?: string; errors?: string[] } | undefined;

const roleEnum = z.enum(["AGENCY_ADMIN", "ACCOUNT_MANAGER", "CLIENT_USER"]);

async function brandFor(agencyId: string) {
  const a = await prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { name: true, brandColor: true, reportFooter: true } });
  return { name: a.name, color: a.brandColor, footer: a.reportFooter };
}

async function teamOf(agencyId: string) {
  const users = await prisma.user.findMany({ where: { agencyId }, select: { id: true, role: true, deactivatedAt: true } });
  return users.map((u) => ({ id: u.id, role: u.role, active: !u.deactivatedAt }));
}

/** Validates client ids belong to the agency. */
async function agencyClientIds(agencyId: string, ids: string[]): Promise<string[] | null> {
  if (!ids.length) return [];
  const found = await prisma.client.findMany({ where: { agencyId, id: { in: ids } }, select: { id: true } });
  return found.length === new Set(ids).size ? found.map((c) => c.id) : null;
}

/** Sends (or, without an email provider, returns) a one-time link. */
async function deliverLink(kind: "invite" | "password_reset", agencyId: string, to: string, link: string, inviterName: string) {
  const brand = await brandFor(agencyId);
  const tpl = kind === "invite" ? inviteEmail(brand, inviterName, link, INVITE_TTL_HOURS) : resetEmail(brand, link, RESET_TTL_MINUTES);
  const r = await sendEmail({ agencyId, to, kind, ...tpl, redact: [link] });
  if (r.status === "SENT") return { ok: `Email sent to ${to}.` };
  // No email provider (or it failed): give the admin the link to pass on securely.
  return {
    ok: r.status === "FAILED" ? `Email to ${to} failed (${r.error}). Share this one-time link with them instead:` : `No email provider is configured. Share this one-time link with ${to} directly:`,
    link,
  };
}

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: roleEnum,
  clientId: z.string().optional(),
});

export async function inviteUser(_prev: TeamState, form: FormData): Promise<TeamState> {
  const admin = await requireAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const f = parsed.data;
  if (await prisma.user.findUnique({ where: { email: f.email } })) return { errors: ["A user with that email already exists."] };

  const assigned = await agencyClientIds(admin.agencyId, form.getAll("clientIds").map(String).filter(Boolean));
  if (assigned === null) return { errors: ["Unknown client selected."] };
  let clientId: string | null = null;
  if (f.role === "CLIENT_USER") {
    const ok = await agencyClientIds(admin.agencyId, f.clientId ? [f.clientId] : []);
    if (!ok?.length) return { errors: ["Choose the client this user can view."] };
    clientId = ok[0];
  }

  const user = await prisma.user.create({
    data: {
      agencyId: admin.agencyId,
      name: f.name,
      email: f.email,
      role: f.role,
      clientId,
      passwordHash: null,
      ...(f.role === "ACCOUNT_MANAGER" && assigned.length ? { assignments: { create: assigned.map((id) => ({ clientId: id })) } } : {}),
    },
  });
  const token = await createAuthToken(user.id, "INVITE");
  const result = await deliverLink("invite", admin.agencyId, user.email, appUrl(`/accept-invite?token=${token}`), admin.name);
  revalidatePath("/settings/team");
  return result;
}

const updateSchema = z.object({ userId: z.string(), role: roleEnum, clientId: z.string().optional() });

export async function updateUser(_prev: TeamState, form: FormData): Promise<TeamState> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const f = parsed.data;
  const target = await prisma.user.findFirst({ where: { id: f.userId, agencyId: admin.agencyId } });
  if (!target) return { errors: ["User not found."] };
  const problem = teamChangeProblem(admin, { id: target.id, role: target.role, active: !target.deactivatedAt }, { role: f.role }, await teamOf(admin.agencyId));
  if (problem) return { errors: [problem] };

  const assigned = await agencyClientIds(admin.agencyId, form.getAll("clientIds").map(String).filter(Boolean));
  if (assigned === null) return { errors: ["Unknown client selected."] };
  let clientId: string | null = null;
  if (f.role === "CLIENT_USER") {
    const ok = await agencyClientIds(admin.agencyId, f.clientId ? [f.clientId] : []);
    if (!ok?.length) return { errors: ["Choose the client this user can view."] };
    clientId = ok[0];
  }
  const role: Role = f.role;
  await prisma.$transaction([
    prisma.clientAssignment.deleteMany({ where: { userId: target.id } }),
    ...(role === "ACCOUNT_MANAGER" ? assigned.map((id) => prisma.clientAssignment.create({ data: { userId: target.id, clientId: id } })) : []),
    prisma.user.update({ where: { id: target.id }, data: { role, clientId } }),
    // A manager who loses a client also stops being its primary manager.
    prisma.client.updateMany({ where: { primaryManagerId: target.id, ...(role === "ACCOUNT_MANAGER" ? { id: { notIn: assigned } } : {}) }, data: { primaryManagerId: null } }),
  ]);
  revalidatePath("/settings/team");
  return { ok: `Saved ${target.name}.` };
}

export async function setUserActive(userId: string, active: boolean): Promise<TeamState> {
  const admin = await requireAdmin();
  const target = await prisma.user.findFirst({ where: { id: userId, agencyId: admin.agencyId } });
  if (!target) return { errors: ["User not found."] };
  if (!active) {
    const problem = teamChangeProblem(admin, { id: target.id, role: target.role, active: !target.deactivatedAt }, { deactivate: true }, await teamOf(admin.agencyId));
    if (problem) return { errors: [problem] };
  }
  await prisma.user.update({
    where: { id: target.id },
    data: active ? { deactivatedAt: null } : { deactivatedAt: new Date(), sessionsValidAfter: new Date() },
  });
  revalidatePath("/settings/team");
  return { ok: active ? `${target.name} can sign in again.` : `${target.name} has been deactivated and signed out.` };
}

/** Re-sends an invitation (no password yet) or sends a password reset. */
export async function sendAccessLink(userId: string): Promise<TeamState> {
  const admin = await requireAdmin();
  const target = await prisma.user.findFirst({ where: { id: userId, agencyId: admin.agencyId } });
  if (!target) return { errors: ["User not found."] };
  if (target.deactivatedAt) return { errors: ["Reactivate the user first."] };
  const kind = target.passwordHash ? "PASSWORD_RESET" : "INVITE";
  const token = await createAuthToken(target.id, kind);
  const path = kind === "INVITE" ? `/accept-invite?token=${token}` : `/reset-password?token=${token}`;
  return deliverLink(kind === "INVITE" ? "invite" : "password_reset", admin.agencyId, target.email, appUrl(path), admin.name);
}
