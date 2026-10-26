// Plain, white-labelled email templates (agency name and brand color).
import { inkFor } from "./brand-color";

export interface Brand {
  name: string;
  color: string;
  footer?: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(brand: Brand, title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b0b0b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #e4e3df;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:3px solid ${esc(brand.color)};font-weight:600">${esc(brand.name)}</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</td></tr>
${brand.footer ? `<tr><td style="padding:16px 24px;border-top:1px solid #e4e3df;font-size:12px;color:#7a7974">${esc(brand.footer)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}

const button = (brand: Brand, href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:${esc(brand.color)};color:${inkFor(brand.color)};padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

export function inviteEmail(brand: Brand, inviter: string, link: string, expiresHours: number) {
  const subject = `${inviter} invited you to ${brand.name}`;
  const text = `${inviter} invited you to ${brand.name}'s advertising reporting.\n\nSet your password to sign in:\n${link}\n\nThis link expires in ${expiresHours} hours and can be used once.`;
  const html = layout(brand, "You're invited", `<p>${esc(inviter)} invited you to ${esc(brand.name)}'s advertising reporting.</p>${button(brand, link, "Set your password")}<p style="font-size:12px;color:#7a7974">This link expires in ${expiresHours} hours and can be used once.</p>`);
  return { subject, text, html };
}

export function resetEmail(brand: Brand, link: string, expiresMinutes: number) {
  const subject = `Reset your ${brand.name} password`;
  const text = `Someone asked to reset your password. If it was you, use this link:\n${link}\n\nIt expires in ${expiresMinutes} minutes and can be used once. If you didn't ask, ignore this email.`;
  const html = layout(brand, "Reset your password", `<p>Someone asked to reset your password. If it was you, use the button below.</p>${button(brand, link, "Choose a new password")}<p style="font-size:12px;color:#7a7974">It expires in ${expiresMinutes} minutes and can be used once. If you didn't ask, ignore this email.</p>`);
  return { subject, text, html };
}

export interface AlertLine {
  severity: "critical" | "warning" | "info";
  client: string;
  title: string;
  detail: string;
}

const SEV = { critical: "Action needed", warning: "Watch", info: "Info" } as const;

export function alertEmail(brand: Brand, alerts: AlertLine[], link: string) {
  const subject = alerts.length === 1 ? `${SEV[alerts[0].severity]}: ${alerts[0].client} — ${alerts[0].title}` : `${alerts.length} new budget alerts`;
  const text = alerts.map((a) => `[${SEV[a.severity]}] ${a.client}: ${a.title}\n  ${a.detail}`).join("\n\n") + `\n\nOpen alerts: ${link}`;
  const html = layout(
    brand,
    alerts.length === 1 ? "New budget alert" : `${alerts.length} new budget alerts`,
    alerts.map((a) => `<p style="margin:0 0 12px"><strong>${SEV[a.severity]} · ${esc(a.client)}</strong><br>${esc(a.title)}<br><span style="color:#52514e;font-size:13px">${esc(a.detail)}</span></p>`).join("") + button(brand, link, "Open alerts"),
  );
  return { subject, text, html };
}

export function dailySummaryEmail(brand: Brand, dateLabel: string, needAction: AlertLine[], onTarget: number, link: string, staleOnTarget: AlertLine[] = []) {
  const subject = needAction.length ? `${dateLabel}: ${needAction.length} account${needAction.length === 1 ? "" : "s"} need attention` : `${dateLabel}: all accounts on track`;
  const staleText = staleOnTarget.length ? `\n\nOn target, but check the data first:\n${staleOnTarget.map((a) => `- ${a.client}: ${a.detail}`).join("\n")}` : "";
  const text =
    (needAction.length ? needAction.map((a) => `[${SEV[a.severity]}] ${a.client}: ${a.title}\n  ${a.detail}`).join("\n\n") : "Every budget line is on track.") +
    staleText +
    `\n\n${onTarget} line${onTarget === 1 ? "" : "s"} on target.\nDashboard: ${link}`;
  const staleHtml = staleOnTarget.length
    ? `<p style="margin:16px 0 6px"><strong>On target, but check the data first</strong></p>${staleOnTarget.map((a) => `<p style="margin:0 0 8px">${esc(a.client)}<br><span style="color:#52514e;font-size:13px">${esc(a.detail)}</span></p>`).join("")}`
    : "";
  const html = layout(
    brand,
    `Daily pacing summary · ${dateLabel}`,
    (needAction.length
      ? needAction.map((a) => `<p style="margin:0 0 12px"><strong>${SEV[a.severity]} · ${esc(a.client)}</strong><br>${esc(a.title)}<br><span style="color:#52514e;font-size:13px">${esc(a.detail)}</span></p>`).join("")
      : "<p>Every budget line is on track.</p>") +
      staleHtml +
      `<p style="color:#52514e;font-size:13px">${onTarget} line${onTarget === 1 ? "" : "s"} on target.</p>${button(brand, link, "Open dashboard")}`,
  );
  return { subject, text, html };
}

/** A scheduled client report: the summary in the body, the PDF attached. */
export function scheduledReportEmail(brand: Brand, o: { clientName: string; title: string; period: string; summaryText: string; summaryHtml: string }) {
  const subject = `${o.clientName} · ${o.title} · ${o.period}`;
  const text = `${o.summaryText}\n\nThe full report for ${o.period} is attached as a PDF.\n\n${brand.name}`;
  const html = layout(brand, `${o.title} · ${o.period}`, `${o.summaryHtml}<p style="color:#52514e;font-size:13px;margin-top:16px">The full report for ${esc(o.period)} is attached as a PDF.</p>`);
  return { subject, text, html };
}
