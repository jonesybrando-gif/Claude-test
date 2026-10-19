import "server-only";
import { site } from "@/lib/site";
import PDFDocument from "pdfkit";

// Drawing helpers shared by the PDF reports. Uses PDFKit's built-in
// Helvetica, which only covers the WinAnsi character set, so text passes
// through pdfText() first.

export type Doc = PDFKit.PDFDocument;

export const C = {
  text: "#0b0b0b",
  text2: "#52514e",
  text3: "#7a7974",
  border: "#e4e3df",
  surface2: "#f6f6f4",
  actual: "#2a78d6",
  projected: "#eb6834",
  planned: "#7a7974",
  good: "#0a6b0a",
  warning: "#7a5300",
  critical: "#a52a2a",
};

const REPLACE: Record<string, string> = {
  "≈": "~",
  "÷": "/",
  "→": "->",
  "▲": "+",
  "▼": "-",
  "≤": "<=",
  "≥": ">=",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "…": "...",
  "−": "-",
  "✓": "",
};

/** Map characters Helvetica (WinAnsi) can't draw to safe equivalents; drop anything else outside Latin-1. */
export function pdfText(s: string): string {
  return [...s]
    .map((ch) => REPLACE[ch] ?? ch)
    .join("")
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—•€]/g, "");
}

export interface Brand {
  name: string;
  color: string;
  header?: string | null;
  footer?: string | null;
  logo?: Buffer | null;
}

export function newDoc(opts: { landscape?: boolean; compress?: boolean; title: string; author: string }): Doc {
  return new PDFDocument({
    size: "LETTER",
    layout: opts.landscape ? "landscape" : "portrait",
    margins: { top: 64, bottom: 56, left: 40, right: 40 },
    bufferPages: true,
    compress: opts.compress ?? true,
    info: { Title: pdfText(opts.title), Author: pdfText(opts.author), Creator: site.appName },
  });
}

export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export const contentWidth = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottomLimit = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

/** Starts a new page when fewer than `needed` points remain. */
export function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > bottomLimit(doc)) doc.addPage();
}

/** Brand bar, header text and page footer on every page (call once at the end). */
export function decoratePages(doc: Doc, brand: Brand, footerLeft: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    // Writing in the margins must not trigger automatic page breaks.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.rect(0, 0, doc.page.width, 6).fill(brand.color);
    let x = left;
    if (brand.logo) {
      try {
        doc.image(brand.logo, left, 18, { fit: [28, 28] });
        x = left + 36;
      } catch {
        /* unsupported image: skip the logo */
      }
    }
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text).text(pdfText(brand.name), x, 22, { width: w / 2, lineBreak: false });
    if (brand.header) doc.font("Helvetica").fontSize(8).fillColor(C.text3).text(pdfText(brand.header), left + w / 2, 24, { width: w / 2, align: "right", lineBreak: false });
    const fy = doc.page.height - 36;
    doc.moveTo(left, fy - 6).lineTo(left + w, fy - 6).lineWidth(0.5).strokeColor(C.border).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(C.text3);
    doc.text(pdfText(brand.footer ? `${brand.footer} · ${footerLeft}` : footerLeft), left, fy, { width: w * 0.8, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + w * 0.8, fy, { width: w * 0.2, align: "right", lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
}

export function sectionTitle(doc: Doc, title: string, subtitle?: string) {
  ensureSpace(doc, 60);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.text).text(pdfText(title), doc.page.margins.left, doc.y);
  if (subtitle) doc.font("Helvetica").fontSize(8.5).fillColor(C.text3).text(pdfText(subtitle));
  doc.moveDown(0.4);
}

export interface Tile {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}

/** A row of KPI tiles. */
export function tiles(doc: Doc, items: Tile[], perRow = 3) {
  const gap = 8;
  const w = (contentWidth(doc) - gap * (perRow - 1)) / perRow;
  const h = 54;
  for (let i = 0; i < items.length; i += perRow) {
    ensureSpace(doc, h + gap);
    const y = doc.y;
    items.slice(i, i + perRow).forEach((t, j) => {
      const x = doc.page.margins.left + j * (w + gap);
      doc.roundedRect(x, y, w, h, 6).lineWidth(0.6).strokeColor(C.border).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor(C.text3).text(pdfText(t.label), x + 10, y + 8, { width: w - 20, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(15).fillColor(C.text).text(pdfText(t.value), x + 10, y + 19, { width: w - 20, lineBreak: false });
      if (t.sub) doc.font("Helvetica").fontSize(7.5).fillColor(t.subColor ?? C.text2).text(pdfText(t.sub), x + 10, y + 39, { width: w - 20, lineBreak: false });
    });
    doc.x = doc.page.margins.left;
    doc.y = y + h + gap;
  }
}

export interface Column {
  header: string;
  width: number; // fraction of content width
  align?: "left" | "right";
}

/** Simple table with a repeating header row and page breaks between rows. */
export function table(doc: Doc, columns: Column[], rows: string[][], opts: { fontSize?: number; colors?: (string | undefined)[][]; noHeader?: boolean } = {}) {
  const fs = opts.fontSize ?? 8;
  const total = contentWidth(doc);
  const left = doc.page.margins.left;
  const widths = columns.map((c) => c.width * total);
  const pad = 4;
  const header = () => {
    if (opts.noHeader) return;
    const y = doc.y;
    doc.rect(left, y, total, fs + 10).fill(C.surface2);
    let x = left;
    columns.forEach((c, i) => {
      doc.font("Helvetica-Bold").fontSize(fs - 0.5).fillColor(C.text2).text(pdfText(c.header), x + pad, y + 5, { width: widths[i] - pad * 2, align: c.align ?? "left", lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + fs + 10;
  };
  ensureSpace(doc, (fs + 10) * 2 + 4);
  header();
  rows.forEach((r, ri) => {
    doc.font("Helvetica").fontSize(fs);
    const heights = r.map((cell, i) => doc.heightOfString(pdfText(cell), { width: widths[i] - pad * 2 }));
    const rowH = Math.max(fs + 6, ...heights) + 6;
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    let x = left;
    r.forEach((cell, i) => {
      doc.font("Helvetica").fontSize(fs).fillColor(opts.colors?.[ri]?.[i] ?? C.text).text(pdfText(cell), x + pad, y + 4, { width: widths[i] - pad * 2, align: columns[i].align ?? "left" });
      x += widths[i];
    });
    doc.moveTo(left, y + rowH).lineTo(left + total, y + rowH).lineWidth(0.4).strokeColor(C.border).stroke();
    doc.x = left;
    doc.y = y + rowH;
  });
  doc.moveDown(0.3);
}

export function paragraph(doc: Doc, text: string, opts: { color?: string; size?: number } = {}) {
  ensureSpace(doc, 30);
  doc.font("Helvetica").fontSize(opts.size ?? 8.5).fillColor(opts.color ?? C.text2).text(pdfText(text), doc.page.margins.left, doc.y, { width: contentWidth(doc) });
}

/** Fetch an https logo for white-label headers (PNG/JPEG, ≤ 2 MB, 3 s timeout). Never throws. */
export async function fetchLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !url.startsWith("https://")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/image\/(png|jpe?g)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= 2_000_000 ? buf : null;
  } catch {
    return null;
  }
}
