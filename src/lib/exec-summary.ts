// The automatic executive summary: plain sentences built directly from the
// report's figures for the selected date range, plus what's working, what
// isn't and recommendations. Used when the AI assistant isn't set up or the
// layout asks for it, and while an AI version is written.

import type { AiContextInput } from "./ai-context";
import { analyzePerformance, hasPlaceholderValues } from "./insights";
import { derive, pctChange } from "./metrics";
import { formatMoney, formatNumber, formatPct } from "./money";
import { STATUS_LABEL } from "./pacing/status";
import { formatDate } from "./time";

const change = (cur: number | null, prev: number | null | undefined) => {
  if (cur === null || prev === null || prev === undefined) return "";
  const p = pctChange(cur, prev);
  if (p === null) return "";
  return Math.abs(p) < 0.5 ? " (about the same as the previous period)" : ` (${p > 0 ? "up" : "down"} ${formatPct(Math.abs(p), 0)})`;
};

export interface ExecutiveSummaryContent {
  /** One or two paragraphs, separated by a blank line. */
  overview: string;
  working: string[];
  notWorking: string[];
  recommendations: string[];
}

export function autoExecutiveSummary(i: AiContextInput): ExecutiveSummaryContent {
  return { overview: autoOverview(i), ...analyzePerformance(i) };
}

/** The headline paragraphs: results for the period, what drove them, and the budget. */
export function autoOverview(i: AiContextInput): string {
  const c = i.currency;
  const money = (v: number) => formatMoney(v, c, { whole: v >= 10000 });
  const t = i.totals;
  const p = i.previous;
  const d = derive(t);
  const pd = p ? derive(p) : null;
  const span = `${formatDate(i.range.from)} – ${formatDate(i.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  const demo = i.isDemo ? "These figures are illustrative demo data. " : "";

  if (t.costMinor === 0 && t.impressions === 0 && t.clicks === 0 && t.conversions === 0 && t.leads === 0) {
    return `${demo}No advertising activity was recorded for ${i.clientName} from ${span}.`;
  }

  // Paragraph 1: results for the period.
  const p1: string[] = [];
  const reach = t.impressions > 0 ? `${formatNumber(t.impressions)} impressions and ${formatNumber(t.clicks)} clicks` : `${formatNumber(t.clicks)} clicks`;
  p1.push(`From ${span} (${i.rangeLabel.toLowerCase()}), ${i.clientName}'s ads earned ${reach}${change(t.clicks, p?.clicks)} on ${money(t.costMinor)} of spend${change(t.costMinor, p?.costMinor)}.`);
  const results: string[] = [];
  if (t.conversions > 0) results.push(`${formatNumber(t.conversions, t.conversions < 100 ? 1 : 0)} conversions at ${d.costPerConversionMinor === null ? "—" : formatMoney(d.costPerConversionMinor, c)} each${change(d.costPerConversionMinor, pd?.costPerConversionMinor)}`);
  if (t.leads > 0) results.push(`${formatNumber(t.leads)} leads at ${d.costPerLeadMinor === null ? "—" : formatMoney(d.costPerLeadMinor, c)} each${change(d.costPerLeadMinor, pd?.costPerLeadMinor)}`);
  if (results.length) p1.push(`That produced ${results.join(" and ")}.`);
  else if (t.costMinor > 0) p1.push("No conversions or leads were reported for the period.");
  if (d.roas !== null && !hasPlaceholderValues(t)) p1.push(`Platforms reported ${money(t.conversionValueMinor)} in conversion value, a ${d.roas.toFixed(2)}× return on ad spend.`);
  if (t.hasEstimatedCost) p1.push("Spend includes estimated Local Services Ads cost.");

  // Paragraph 2: what drove it, and the budget.
  const p2: string[] = [];
  const top = [...i.campaigns].sort((a, b) => b.totals.costMinor - a.totals.costMinor)[0];
  if (top && i.campaigns.length > 1) {
    const share = t.costMinor ? (top.totals.costMinor / t.costMinor) * 100 : 0;
    const res = top.totals.conversions > 0 ? ` and ${formatNumber(top.totals.conversions, top.totals.conversions < 100 ? 1 : 0)} conversions` : top.totals.leads > 0 ? ` and ${formatNumber(top.totals.leads)} leads` : "";
    p2.push(`The largest campaign was ${top.name} on ${top.platform}, with ${money(top.totals.costMinor)} (${formatPct(share, 0)} of spend)${res}.`);
  }
  if (i.pastBudget) {
    const b = i.pastBudget;
    p2.push(`${b.month} finished at ${money(b.spentMinor)} against a ${money(b.budgetMinor)} budget (${formatPct(b.budgetMinor ? (b.spentMinor / b.budgetMinor) * 100 : null, 0)}).`);
  } else if (i.pacing && i.range.to >= i.pacing.periodStart) {
    const pc = i.pacing;
    const month = formatDate(pc.periodStart, { month: "long" });
    const where = pc.status === "ON_TARGET" ? "on plan" : pc.status.includes("OVER") ? "ahead of plan" : pc.status.includes("UNDER") ? "behind plan" : STATUS_LABEL[pc.status].toLowerCase();
    p2.push(`For ${month}, ${money(pc.actualToDateMinor)} of the ${money(pc.budgetMinor)} budget has been spent${pc.asOf ? ` through ${formatDate(pc.asOf)}` : ""}, ${where}; at the current pace the month would end at ${money(pc.projectedMinor)}.`);
  }
  return [demo + p1.join(" "), p2.join(" ")].filter((x) => x.trim()).join("\n\n");
}

// --- Email-ready copies -----------------------------------------------------

const SECTIONS = [
  { key: "working", title: "What's working", numbered: false },
  { key: "notWorking", title: "What needs attention", numbered: false },
  { key: "recommendations", title: "Recommendations", numbered: true },
] as const;

/** Plain text for pasting into any email client. */
export function summaryAsText(s: ExecutiveSummaryContent, heading: string): string {
  const out = [heading, "", ...s.overview.split(/\n{2,}/).flatMap((p) => [p.trim(), ""])];
  for (const sec of SECTIONS) {
    const items = s[sec.key];
    if (!items.length) continue;
    out.push(sec.title, ...items.map((x, i) => `${sec.numbered ? `${i + 1}.` : "•"} ${x}`), "");
  }
  return out.join("\n").trim();
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Simple inline-styled HTML that keeps its formatting when pasted into Gmail or Outlook. */
export function summaryAsHtml(s: ExecutiveSummaryContent, heading: string): string {
  const p = "margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2328;";
  const h = "margin:16px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#1f2328;";
  const li = "margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2328;";
  const parts = [`<p style="${h}margin-top:0;font-size:16px;">${esc(heading)}</p>`, ...s.overview.split(/\n{2,}/).map((x) => `<p style="${p}">${esc(x.trim())}</p>`)];
  for (const sec of SECTIONS) {
    const items = s[sec.key];
    if (!items.length) continue;
    const tag = sec.numbered ? "ol" : "ul";
    parts.push(`<p style="${h}">${esc(sec.title)}</p>`, `<${tag} style="margin:0 0 12px;padding-left:22px;">${items.map((x) => `<li style="${li}">${esc(x)}</li>`).join("")}</${tag}>`);
  }
  return `<div>${parts.join("")}</div>`;
}
