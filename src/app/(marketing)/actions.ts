"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sendEmail } from "@/server/email";
import { prisma } from "@/server/db";
import { clientIp } from "@/lib/login-throttle";
import { site } from "@/lib/site";

export type EarlyAccessState = { ok?: boolean; error?: string } | undefined;

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a work email we can reply to.").max(200),
  agency: z.string().trim().min(1, "Enter your agency or company name.").max(160),
  accounts: z.enum(["1-10", "11-30", "31-100", "100+"], { errorMap: () => ({ message: "Choose how many ad accounts you manage." }) }),
  note: z.string().trim().max(1000).optional(),
});

// Light per-instance limit so the public form can't be used to flood the inbox.
const recent = new Map<string, number[]>();
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 5;

function allow(ip: string, now = Date.now()): boolean {
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return false;
  hits.push(now);
  recent.set(ip, hits);
  return true;
}

export async function requestEarlyAccess(_prev: EarlyAccessState, form: FormData): Promise<EarlyAccessState> {
  // Honeypot: people never see this field, form-filling bots usually fill it.
  if (String(form.get("website") ?? "").length > 0) return { ok: true };

  const parsed = schema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    agency: form.get("agency"),
    accounts: form.get("accounts"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  if (!allow(clientIp(await headers()))) return { error: "Too many requests from this network. Try again in an hour or email us directly." };

  const d = parsed.data;
  const text = [
    `New early-access request for ${site.appName}`,
    "",
    `Name: ${d.name}`,
    `Email: ${d.email}`,
    `Agency: ${d.agency}`,
    `Client ad accounts: ${d.accounts}`,
    d.note ? `\nNote:\n${d.note}` : "",
  ].join("\n");

  // Recorded in the outbox even when SMTP isn't configured, so no request is lost.
  // Filed under the first (owner) agency so it shows in Settings → Email.
  const owner = await prisma.agency.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  await sendEmail({
    agencyId: owner?.id ?? null,
    to: site.contactEmail ?? "early-access@unconfigured",
    replyTo: d.email,
    subject: `Early access: ${d.agency} (${d.accounts} accounts)`,
    text,
    kind: "lead",
  });
  return { ok: true };
}
