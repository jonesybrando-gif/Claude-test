import "server-only";
import type { ClientReport } from "../client-report";
import { campaignTable, dailySeries, kpiTiles, spendSlices, type Change, type Tone } from "../report-dashboard-data";
import { budgetTile } from "@/lib/at-a-glance";
import { formatMoney, formatNumber } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { C, contentWidth, ensureSpace, pdfText, type Doc } from "./primitives";

// The client report dashboard drawn in the PDF: the same header, navy tiles,
// dark section bands, daily chart, spend ring and campaign table as the page
// (src/components/reports/report-dashboard.tsx), from the same figures.

export const D = {
  tile: "#14304a",
  tileMuted: "#c4d2e0",
  tileTrack: "#2b4b69",
  band: "#17191c",
  bandMuted: "#b9bec6",
  spend: "#2a78d6",
  results: "#eb6834",
  grid: "#ecebe7",
  totalRow: "#f3efe9",
  progress: "#f2a766",
};

const PILL: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "#ddf3ee", fg: "#0b5e57" },
  bad: { bg: "#fde7e4", fg: "#9f1f14" },
  neutral: { bg: D.tileTrack, fg: "#ffffff" },
};
const INK: Record<Tone, string> = { good: C.good, bad: C.critical, neutral: C.text3 };

/** Badge text Helvetica can draw: "+12% so far", "-50%". */
const badgeText = (ch: NonNullable<Change>) => pdfText(ch.badge.replace("▲ ", "+").replace("▼ ", "-"));

/** The client's logo (or initials), the report title, the client's name and the period. */
export function drawClientHeader(doc: Doc, opts: { name: string; logo: Buffer | null; kicker: string; period: string; demo: boolean }) {
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  let x = left;
  const h = 46;
  if (opts.logo) {
    try {
      doc.roundedRect(left, top, 112, h, 8).lineWidth(0.6).strokeColor(C.border).stroke();
      doc.image(opts.logo, left + 6, top + 5, { fit: [100, h - 10], align: "center", valign: "center" });
      x = left + 124;
    } catch {
      x = left;
    }
  }
  if (x === left) {
    const initials = opts.name.split(/\s+/).filter((w) => w && !/^(and|&|the|of)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    doc.roundedRect(left, top, h, h, 8).lineWidth(0.6).strokeColor(C.border).stroke();
    doc.font("Helvetica-Bold").fontSize(15).fillColor(C.text).text(pdfText(initials), left, top + 15, { width: h, align: "center", lineBreak: false });
    x = left + h + 12;
  }
  const w = contentWidth(doc) - (x - left);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.text3).text(pdfText(opts.kicker.toUpperCase()), x, top + 1, { width: w, characterSpacing: 0.8, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text(pdfText(opts.name), x, top + 12, { width: w, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(9).fillColor(C.text2).text(pdfText(opts.period), x, top + 34, { width: w, lineBreak: false, ellipsis: true });
  doc.x = left;
  doc.y = top + h + 8;
  if (opts.demo) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1c5cab").text("Illustrative demo data - not real advertising results.", left, doc.y);
  }
  doc.y += 10;
}

/** A dark full-width band that opens a section. */
export function drawBand(doc: Doc, title: string, note?: string) {
  ensureSpace(doc, 120); // keep the band with what follows
  const left = doc.page.margins.left;
  const w = contentWidth(doc);
  const y = doc.y + 4;
  doc.roundedRect(left, y, w, 30, 7).fill(D.band);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff").text(pdfText(title), left + 14, y + 9, { lineBreak: false });
  if (note) {
    const tw = doc.widthOfString(pdfText(title));
    doc.font("Helvetica").fontSize(8.5).fillColor(D.bandMuted).text(pdfText(note), left + 14 + tw + 10, y + 11.5, { width: w - tw - 40, lineBreak: false, ellipsis: true });
  }
  doc.x = left;
  doc.y = y + 30 + 10;
}

function pill(doc: Doc, ch: NonNullable<Change>, right: number, y: number) {
  const text = badgeText(ch);
  doc.font("Helvetica-Bold").fontSize(7);
  const w = doc.widthOfString(text) + 10;
  const { bg, fg } = PILL[ch.tone];
  doc.roundedRect(right - w, y, w, 12, 6).fill(bg);
  doc.fillColor(fg).text(text, right - w + 5, y + 2.6, { lineBreak: false });
}

/** The headline figures as navy tiles, three to a row, each with its change badge and the previous figure. */
export function drawKpiTiles(doc: Doc, rep: ClientReport) {
  const items = kpiTiles(rep);
  const perRow = 3;
  const gap = 8;
  const w = (contentWidth(doc) - gap * (perRow - 1)) / perRow;
  const h = 62;
  for (let i = 0; i < items.length; i += perRow) {
    ensureSpace(doc, h + gap);
    const y = doc.y;
    items.slice(i, i + perRow).forEach((t, j) => {
      const x = doc.page.margins.left + j * (w + gap);
      doc.roundedRect(x, y, w, h, 8).fill(D.tile);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(D.tileMuted).text(pdfText(t.label), x + 11, y + 10, { width: w - 80, lineBreak: false, ellipsis: true });
      if (t.change) pill(doc, t.change, x + w - 9, y + 8);
      doc.font("Helvetica-Bold").fontSize(19).fillColor("#ffffff").text(pdfText(t.value), x + 11, y + 23, { width: w - 22, lineBreak: false });
      if (t.sub) doc.font("Helvetica").fontSize(7).fillColor(D.tileMuted).text(pdfText(t.sub), x + 11, y + 47, { width: w - 22, lineBreak: false, ellipsis: true });
    });
    doc.x = doc.page.margins.left;
    doc.y = y + h + gap;
  }
  doc.y += 4;
}

/** Spend against the current budget on a navy strip with a progress bar. Draws nothing without a budget. */
export function drawBudgetCard(doc: Doc, rep: ClientReport) {
  const p = rep.pacing.total;
  if (!p || p.budgetMinor <= 0) return;
  const c = rep.client.currency;
  const tile = budgetTile(p, c);
  const left = doc.page.margins.left;
  const w = contentWidth(doc);
  const h = 58;
  ensureSpace(doc, h + 10);
  const y = doc.y;
  const month = p.periodStart.endsWith("-01") && p.periodStart.slice(0, 7) === p.periodEnd.slice(0, 7);
  const name = month ? formatDate(p.periodStart, { month: "long", year: "numeric" }) : `${formatDate(p.periodStart)} - ${formatDate(p.periodEnd)}`;
  const used = Math.max(0, Math.min(1, p.actualToDateMinor / p.budgetMinor));
  doc.roundedRect(left, y, w, h, 8).fill(D.tile);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text(pdfText(`Budget · ${name}`), left + 12, y + 10, { lineBreak: false });
  pill(doc, { badge: tile.short, tone: tile.tone, aria: "" }, left + w - 12, y + 9);
  const spent = formatMoney(p.actualToDateMinor, c, { whole: true });
  doc.font("Helvetica-Bold").fontSize(17).fillColor("#ffffff").text(pdfText(spent), left + 12, y + 24, { lineBreak: false });
  const sw = doc.widthOfString(pdfText(spent));
  doc.font("Helvetica").fontSize(9).fillColor(D.tileMuted).text(pdfText(`of ${formatMoney(p.budgetMinor, c, { whole: true })}`), left + 16 + sw, y + 30, { lineBreak: false });
  const barX = left + w * 0.45;
  const barW = w * 0.55 - 12;
  doc.roundedRect(barX, y + 28, barW, 6, 3).fill(D.tileTrack);
  if (used > 0) doc.roundedRect(barX, y + 28, Math.max(6, barW * used), 6, 3).fill(D.progress);
  const note = p.phase === "ENDED" ? "Final spend for the period." : `At the current pace this period ends near ${formatMoney(p.projectedMinor, c, { whole: true })} (estimate).`;
  doc.font("Helvetica").fontSize(7.5).fillColor(D.tileMuted).text(pdfText(note), barX, y + 40, { width: barW, lineBreak: false, ellipsis: true });
  doc.x = left;
  doc.y = y + h + 10;
}

/** Daily spend bars with the day's results as a line on its own scale. */
export function drawDailyChart(doc: Doc, rep: ClientReport, height = 150) {
  const { label, days } = dailySeries(rep);
  if (!days.length) return;
  const c = rep.client.currency;
  ensureSpace(doc, height + 50);
  const left = doc.page.margins.left;
  const w = contentWidth(doc);
  const spend = days.reduce((n, d) => n + d.spendMinor, 0);
  const results = days.reduce((n, d) => n + d.results, 0);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text).text(pdfText(`Spend and ${label.toLowerCase()} by day`), left, doc.y);
  doc.font("Helvetica").fontSize(8).fillColor(C.text2).text(pdfText(`${formatMoney(spend, c, { whole: true })} over ${days.length} days, ${formatNumber(Math.round(results))} ${label.toLowerCase()}.`), left, doc.y + 2);
  // Legend
  const ly = doc.y + 4;
  doc.rect(left, ly + 1, 7, 7).fill(D.spend);
  doc.font("Helvetica").fontSize(7.5).fillColor(C.text2).text("Spend", left + 10, ly, { lineBreak: false });
  doc.moveTo(left + 46, ly + 4.5).lineTo(left + 56, ly + 4.5).lineWidth(1.6).strokeColor(D.results).stroke();
  doc.text(pdfText(label), left + 59, ly, { lineBreak: false });
  const top = ly + 16;
  const axisL = 40;
  const axisR = 24;
  const plotX = left + axisL;
  const plotW = w - axisL - axisR;
  const maxSpend = Math.max(1, ...days.map((d) => d.spendMinor));
  const maxRes = Math.max(1, ...days.map((d) => d.results));
  const niceRes = Math.max(2, Math.ceil(maxRes / 2) * 2);
  // Grid and axes
  for (let k = 0; k <= 2; k++) {
    const gy = top + height - (height * k) / 2;
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(k === 0 ? C.border : D.grid).stroke();
    doc.font("Helvetica").fontSize(6.5).fillColor(C.text3).text(pdfText(formatMoney(Math.round((maxSpend * k) / 2 / 100) * 100, c, { whole: true })), left, gy - 3, { width: axisL - 4, align: "right", lineBreak: false });
    doc.text(formatNumber((niceRes * k) / 2), plotX + plotW + 4, gy - 3, { width: axisR - 4, lineBreak: false });
  }
  const step = plotW / days.length;
  const barW = Math.max(1.5, step * 0.72);
  days.forEach((d, i) => {
    const bh = (d.spendMinor / maxSpend) * height;
    if (bh > 0) doc.rect(plotX + i * step + (step - barW) / 2, top + height - bh, barW, bh).fill(D.spend);
  });
  days.forEach((d, i) => {
    const px = plotX + i * step + step / 2;
    const py = top + height - (d.results / niceRes) * height;
    if (i === 0) doc.moveTo(px, py);
    else doc.lineTo(px, py);
  });
  doc.lineWidth(1.6).strokeColor(D.results).stroke();
  // Date labels: first, every seventh day, last.
  days.forEach((d, i) => {
    if (i % 7 !== 0 && i !== days.length - 1) return;
    doc.font("Helvetica").fontSize(6.5).fillColor(C.text3).text(pdfText(formatDate(d.date, { month: "short", day: "numeric" })), plotX + i * step + step / 2 - 20, top + height + 4, { width: 40, align: "center", lineBreak: false });
  });
  doc.x = left;
  doc.y = top + height + 18;
}

/** "Where the budget went": a ring of spend by campaign with its legend beside it. */
export function drawSpendRing(doc: Doc, rep: ClientReport) {
  const slices = spendSlices(rep);
  if (!slices.length) return;
  const c = rep.client.currency;
  const rowH = 15;
  const size = 110;
  ensureSpace(doc, Math.max(size, slices.length * rowH) + 30);
  const left = doc.page.margins.left;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text).text("Where the budget went", left, doc.y);
  const y = doc.y + 8;
  const cx = left + size / 2;
  const cy = y + size / 2;
  const R = size / 2;
  const r = R * 0.62;
  let a0 = -Math.PI / 2;
  for (const s of slices) {
    const a1 = a0 + (s.pct / 100) * Math.PI * 2;
    const steps = Math.max(4, Math.ceil((a1 - a0) / 0.05));
    const pts: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    for (let k = steps; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / steps;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    doc.polygon(...pts).fill(s.color);
    a0 = a1;
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text(pdfText(formatMoney(rep.perf.totals.costMinor, c, { whole: true })), cx - r, cy - 9, { width: r * 2, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).fillColor(C.text3).text("total spend", cx - r, cy + 4, { width: r * 2, align: "center", lineBreak: false });
  const lx = left + size + 24;
  const lw = contentWidth(doc) - size - 24;
  slices.forEach((s, i) => {
    const ry = y + 10 + i * rowH;
    doc.rect(lx, ry + 1, 8, 8).fill(s.color);
    doc.font("Helvetica").fontSize(8.5).fillColor(C.text).text(pdfText(s.name), lx + 14, ry, { width: lw - 130, lineBreak: false, ellipsis: true });
    doc.font("Helvetica-Bold").text(pdfText(formatMoney(s.minor, c, { whole: true })), lx + lw - 110, ry, { width: 70, align: "right", lineBreak: false });
    doc.font("Helvetica").fillColor(C.text3).text(`${Math.round(s.pct)}%`, lx + lw - 36, ry, { width: 36, align: "right", lineBreak: false });
  });
  doc.x = left;
  doc.y = y + Math.max(size, slices.length * rowH + 10) + 12;
}

/** The campaign table: a highlighted totals row, then each campaign, with the change under every figure. */
export function drawCampaignTable(doc: Doc, rep: ClientReport) {
  const { heads, totals, rows } = campaignTable(rep);
  const left = doc.page.margins.left;
  const total = contentWidth(doc);
  if (!rows.length) {
    doc.font("Helvetica").fontSize(9).fillColor(C.text3).text("No campaign ran in this period.", left, doc.y);
    return;
  }
  const first = 0.28;
  const widths = [first * total, ...heads.map(() => ((1 - first) * total) / heads.length)];
  const pad = 5;
  const header = () => {
    const y = doc.y;
    doc.rect(left, y, total, 22).fill(C.surface2);
    let x = left;
    ["Campaign", ...heads].forEach((h, i) => {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.text2).text(pdfText(h), x + pad, y + 7.5, { width: widths[i] - pad * 2, align: i === 0 ? "left" : "right", lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + 22;
  };
  const drawRow = (name: string, sub: string | null, cells: { v: string; ch: Change }[], isTotal: boolean) => {
    doc.font(isTotal ? "Helvetica-Bold" : "Helvetica-Bold").fontSize(isTotal ? 9.5 : 8.5);
    const nameH = doc.heightOfString(pdfText(name), { width: widths[0] - pad * 2 });
    const h = Math.max(30, nameH + (sub ? 12 : 0) + 12);
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    if (isTotal) doc.rect(left, y, total, h).fill(D.totalRow);
    doc.font("Helvetica-Bold").fontSize(isTotal ? 9.5 : 8.5).fillColor(C.text).text(pdfText(name), left + pad, y + 6, { width: widths[0] - pad * 2 });
    if (sub) doc.font("Helvetica").fontSize(7).fillColor(C.text3).text(pdfText(sub), left + pad, y + 6 + nameH + 1, { width: widths[0] - pad * 2, lineBreak: false });
    let x = left + widths[0];
    cells.forEach((cell, i) => {
      const cw = widths[i + 1] - pad * 2;
      doc.font(isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(C.text).text(pdfText(cell.v), x + pad, y + 6, { width: cw, align: "right", lineBreak: false });
      if (cell.ch) doc.font("Helvetica-Bold").fontSize(7).fillColor(INK[cell.ch.tone]).text(badgeText(cell.ch), x + pad, y + 17, { width: cw, align: "right", lineBreak: false });
      x += widths[i + 1];
    });
    doc.moveTo(left, y + h).lineTo(left + total, y + h).lineWidth(0.4).strokeColor(C.border).stroke();
    doc.y = y + h;
  };
  ensureSpace(doc, 22 + 30 * 2);
  header();
  if (totals) drawRow("Total", null, totals, true);
  for (const { line, cells } of rows) drawRow(line.name, `${line.platform} · ${line.status.charAt(0) + line.status.slice(1).toLowerCase()}`, cells, false);
  if (rep.cmpRange) {
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(7).fillColor(C.text3).text(pdfText(`Change compared with ${formatDate(rep.cmpRange.from)} - ${formatDate(rep.cmpRange.to, { month: "short", day: "numeric", year: "numeric" })}.`), left, doc.y);
  }
  doc.x = left;
  doc.moveDown(0.8);
}
