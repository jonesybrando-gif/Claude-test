import "server-only";
import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import { isSlackWebhookUrl } from "@/lib/slack";

/** The agency's Slack webhook URL, or null when Slack isn't set up (or can't be decrypted). */
export async function agencySlackWebhook(agencyId: string): Promise<string | null> {
  const a = await prisma.agency.findUnique({ where: { id: agencyId }, select: { slackWebhookEnc: true } });
  if (!a?.slackWebhookEnc) return null;
  try {
    const url = decryptSecret(a.slackWebhookEnc);
    return isSlackWebhookUrl(url) ? url : null;
  } catch {
    return null;
  }
}

/** Posts a message to a Slack incoming webhook. Never throws. */
export async function postToSlack(url: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSlackWebhookUrl(url)) return { ok: false, error: "Not a Slack webhook URL" };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
    return res.ok ? { ok: true } : { ok: false, error: `Slack answered ${res.status}: ${(await res.text()).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
