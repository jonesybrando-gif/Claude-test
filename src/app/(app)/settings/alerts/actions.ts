"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { resolveAlertSettings, validateAlertSettings, type AlertSettings } from "@/lib/alerts";
import { parseMoneyToMinor } from "@/lib/money";
import { postToSlack, SLACK_WEBHOOK_RE } from "@/server/slack";

export type AlertSettingsState = { ok?: string; errors?: string[] } | undefined;

export async function saveAlertSettings(_prev: AlertSettingsState, form: FormData): Promise<AlertSettingsState> {
  const admin = await requireAdmin();
  const num = (k: string) => Number(String(form.get(k) ?? "").trim());
  let spikeMin: number, stoppedMin: number;
  try {
    spikeMin = parseMoneyToMinor(String(form.get("spikeMinDaily") ?? "0"));
    stoppedMin = parseMoneyToMinor(String(form.get("stoppedMinDaily") ?? "0"));
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
  const s: AlertSettings = resolveAlertSettings({
    overrunPct: num("overrunPct"),
    spikeMultiplier: num("spikeMultiplier"),
    spikeMinDailyMinor: spikeMin,
    stoppedDays: num("stoppedDays"),
    stoppedMinDailyMinor: stoppedMin,
    campaignNoSpendDays: num("campaignNoSpendDays"),
    staleHours: num("staleHours"),
  });
  const problems = validateAlertSettings(s);
  if (problems.length) return { errors: problems };
  await prisma.agency.update({ where: { id: admin.agencyId }, data: { alertSettings: { ...s } } });
  revalidatePath("/settings/alerts");
  return { ok: "Saved. New thresholds apply from the next check." };
}

export type SlackState = { ok?: string; error?: string } | undefined;

/** Saves (or clears) the Slack webhook; "Send test" posts a test message first. */
export async function saveSlackWebhook(_prev: SlackState, form: FormData): Promise<SlackState> {
  const admin = await requireAdmin();
  const url = String(form.get("slackWebhookUrl") ?? "").trim();
  if (url && !SLACK_WEBHOOK_RE.test(url)) return { error: "Paste a Slack incoming webhook URL (https://hooks.slack.com/services/…)." };
  if (url && form.get("test")) {
    const ok = await postToSlack(url, ":white_check_mark: Marketing Nexus alerts are connected to this channel.");
    if (!ok) return { error: "Slack didn't accept the test message. Check the webhook URL." };
  }
  await prisma.agency.update({ where: { id: admin.agencyId }, data: { slackWebhookUrl: url || null } });
  revalidatePath("/settings/alerts");
  return { ok: url ? (form.get("test") ? "Saved, and a test message was sent." : "Saved. New alerts will post to Slack.") : "Slack alerts turned off." };
}
