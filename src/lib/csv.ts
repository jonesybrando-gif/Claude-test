// CSV writer for exports opened in Excel / Google Sheets.
// - RFC 4180 quoting
// - Text that would be interpreted as a formula (= + - @ tab CR) is prefixed
//   with an apostrophe, because account and campaign names come from ad
//   platforms and must never execute as formulas ("CSV injection").
// - Numbers are written as plain numbers; money is exact decimals from minor units.
// - UTF-8 byte-order mark so Excel detects the encoding.

export type Cell = string | number | boolean | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Minor units → exact decimal (12345 → 123.45, -5 → -0.05). */
export function minorToDecimal(minor: number | null | undefined): number | null {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return null;
  return Number((minor / 100).toFixed(2));
}

export function round(n: number | null | undefined, digits = 2): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Number(n.toFixed(digits));
}

/** Safe file name part: "Bright Smile Orthodontics" → "bright-smile-orthodontics". */
export function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "report";
}
