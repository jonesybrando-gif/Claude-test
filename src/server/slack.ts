import "server-only";

// Posts to a Slack incoming webhook. Best effort: alerts are also shown in
// the app and emailed, so a Slack failure is logged and never thrown.

export const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

export interface SlackAlertLine {
  severity: string;
  client: string;
  title: string;
}

/** Slack message text for a batch of new alerts. Plain mrkdwn, no blocks. */
export function slackAlertText(lines: SlackAlertLine[], alertsUrl: string): string {
  const icon = (s: string) => (s === "critical" ? ":red_circle:" : s === "warning" ? ":large_orange_circle:" : ":large_blue_circle:");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const shown = lines.slice(0, 15).map((l) => `${icon(l.severity)} *${esc(l.client)}*: ${esc(l.title)}`);
  const more = lines.length > shown.length ? `\n…and ${lines.length - shown.length} more` : "";
  return `${lines.length} new alert${lines.length === 1 ? "" : "s"}\n${shown.join("\n")}${more}\n<${alertsUrl}|Open alerts>`;
}

export async function postToSlack(webhookUrl: string, text: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!SLACK_WEBHOOK_RE.test(webhookUrl)) return false;
  try {
    const res = await fetchImpl(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
    if (!res.ok) console.warn(`Slack webhook returned ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn("Slack webhook failed", (e as Error).message);
    return false;
  }
}
