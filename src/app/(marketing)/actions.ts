"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sendEmail } from "@/server/email";
import { prisma } from "@/server/db";
import { clientIp } from "@/lib/login-throttle";
import { site } from "@/lib/site";

export type EarlyAccessState = { ok?: boolean; error?: string } | undefined;

// One required field. Everything else about the agency is gathered on the setup call.
const schema = z.object({
  email: z.string().trim().email("Enter a work email we can reply to.").max(200),
  position: z.string().trim().max(40).optional(),
  variant: z.string().trim().max(40).optional(),
  utm: z.string().trim().max(500).optional(),
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
    email: form.get("email"),
    position: form.get("position") || undefined,
    variant: form.get("variant") || undefined,
    utm: form.get("utm") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the email address and try again." };

  if (!allow(clientIp(await headers()))) return { error: "Too many requests from this network. Try again in an hour or email us directly." };

  const d = parsed.data;
  const text = [
    `New early-access request for ${site.appName}`,
    "",
    `Email: ${d.email}`,
    d.position ? `Form: ${d.position}${d.variant ? ` (button: ${d.variant})` : ""}` : "",
    d.utm ? `Campaign: ${d.utm}` : "",
    "",
    "Next step: reply with an invitation to book their setup call.",
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");

  // Recorded in the outbox even when SMTP isn't configured, so no request is lost.
  // Filed under the first (owner) agency so it shows in Settings → Email.
  try {
    const owner = await prisma.agency.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    await sendEmail({
      agencyId: owner?.id ?? null,
      to: site.contactEmail ?? "early-access@unconfigured",
      replyTo: d.email,
      subject: `Early access request: ${d.email}`,
      text,
      kind: "lead",
    });
  } catch (e) {
    console.error("early access request not saved", e);
    return { error: `Something went wrong saving your request. Try again in a minute${site.contactEmail ? ` or email ${site.contactEmail}` : ""}.` };
  }
  return { ok: true };
}
