// Slack incoming webhooks for alerts. Only Slack's own webhook host is
// accepted, so the URL can't be pointed at an internal service.

import type { AlertLine } from "./email-templates";

export function isSlackWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/");
  } catch {
    return false;
  }
}

const SEV = { critical: ":red_circle:", warning: ":large_orange_circle:", info: ":large_blue_circle:" } as const;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One Slack message (mrkdwn) for a batch of new alerts, capped at 10 lines. */
export function slackAlertText(agencyName: string, alerts: AlertLine[], link: string): string {
  const head = `*${esc(agencyName)}: ${alerts.length} new alert${alerts.length === 1 ? "" : "s"}*`;
  const lines = alerts.slice(0, 10).map((a) => `${SEV[a.severity]} *${esc(a.client)}* · ${esc(a.title)}\n      ${esc(a.detail)}`);
  const more = alerts.length > 10 ? [`…and ${alerts.length - 10} more.`] : [];
  return [head, ...lines, ...more, `<${link}|Open alerts>`].join("\n");
}
