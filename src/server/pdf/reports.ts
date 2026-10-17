import "server-only";
import type { PacingResult, PacingSeriesPoint } from "@/lib/pacing/engine";
import type { ClientReport } from "../client-report";
import type { AgencySummary, ClientPacing } from "../pacing-service";
import { derive, pctChange } from "@/lib/metrics";
import { formatMoney, formatMoneyCompact, formatNumber, formatPct } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { STATUS_LABEL, type PacingStatus } from "@/lib/pacing/status";
import { C, contentWidth, decoratePages, ensureSpace, newDoc, paragraph, pdfText, sectionTitle, table, tiles, toBuffer, type Brand, type Column, type Doc } from "./primitives";

const STATUS_COLOR: Record<PacingStatus, string> = {
  OVERSPENDING: C.critical,
  UNDERSPENDING: C.critical,
  SLIGHTLY_OVER: C.warning,
  SLIGHTLY_UNDER: C.warning,
  ON_TARGET: C.good,
  NOT_STARTED: C.text3,
  NO_BUDGET: C.text3,
};

const money = (m: number | null | undefined, c: string) => (m === null || m === undefined ? "—" : formatMoney(m, c, { whole: true }));
const signed = (m: number, c: string) => `${m > 0 ? "+" : m < 0 ? "-" : ""}${formatMoney(Math.abs(m), c, { whole: true })}`;
const change = (cur: number, prev: number | undefined, label = "vs. comparison") => {
  if (prev === undefined) return undefined;
  const p = pctChange(cur, prev);
  if (p === null) return "no prior data";
  if (Math.abs(p) < 0.05) return `no change ${label}`;
  return `${p > 0 ? "up" : "down"} ${formatPct(Math.abs(p))} ${label}`;
};

/** Cumulative planned vs actual vs projected spend, with the budget line. */
export function drawPacingChart(doc: Doc, series: PacingSeriesPoint[], budgetMinor: number, currency: string, height = 170) {
  ensureSpace(doc, height + 40);
  const left = doc.page.margins.left;
  const w = contentWidth(doc);
  const axisW = 46;
  const x0 = left + axisW;
  const plotW = w - axisW - 40;
  const top = doc.y + 18;
  const bottom = top + height;

  // Legend
  const legend: [string, string, boolean][] = [["Actual spend", C.actual, false], ["Planned", C.planned, true], ["Projected", C.projected, true]];
  let lx = left;
  for (const [label, color, dashed] of legend) {
    doc.save().moveTo(lx, doc.y + 5).lineTo(lx + 16, doc.y + 5).lineWidth(1.6).strokeColor(color);
    if (dashed) doc.dash(3, { space: 2 });
    doc.stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(C.text2).text(label, lx + 20, doc.y + 1, { lineBreak: false });
    lx += 20 + doc.widthOfString(label) + 14;
  }
  doc.text(pdfText(`Budget ${money(budgetMinor, currency)}`), lx, doc.y, { lineBreak: false });

  const maxY = Math.max(budgetMinor, ...series.map((p) => Math.max(p.plannedCumulative, p.actualCumulative ?? 0, p.projectedCumulative ?? 0))) * 1.08 || 1;
  const xAt = (i: number) => x0 + (series.length <= 1 ? 0 : (i / (series.length - 1)) * plotW);
  const yAt = (v: number) => bottom - (v / maxY) * height;

  // Grid and y labels
  doc.font("Helvetica").fontSize(7).fillColor(C.text3);
  for (let g = 0; g <= 4; g++) {
    const v = (maxY / 4) * g;
    const y = yAt(v);
    doc.moveTo(x0, y).lineTo(x0 + plotW, y).lineWidth(0.4).strokeColor(C.border).stroke();
    doc.text(formatMoneyCompact(v, currency), left, y - 4, { width: axisW - 6, align: "right", lineBreak: false });
  }
  // Budget line
  doc.moveTo(x0, yAt(budgetMinor)).lineTo(x0 + plotW, yAt(budgetMinor)).lineWidth(0.8).strokeColor(C.text3).stroke();
  doc.fontSize(7).fillColor(C.text2).text("Budget", x0 + plotW + 4, yAt(budgetMinor) - 4, { lineBreak: false });
  // x labels: first, weekly, last
  series.forEach((p, i) => {
    if (i === 0 || i === series.length - 1 || (i + 1) % 7 === 0) {
      doc.fontSize(7).fillColor(C.text3).text(formatDate(p.date), xAt(i) - 20, bottom + 4, { width: 40, align: "center", lineBreak: false });
    }
  });

  const line = (values: (number | null)[], color: string, dashed: boolean) => {
    let started = false;
    doc.save().lineWidth(1.6).strokeColor(color);
    if (dashed) doc.dash(3, { space: 2 });
    values.forEach((v, i) => {
      if (v === null) return;
      if (!started) {
        doc.moveTo(xAt(i), yAt(v));
        started = true;
      } else doc.lineTo(xAt(i), yAt(v));
    });
    if (started) doc.stroke();
    doc.restore();
  };
  line(series.map((p) => p.plannedCumulative), C.planned, true);
  line(series.map((p) => p.projectedCumulative), C.projected, true);
  line(series.map((p) => p.actualCumulative), C.actual, false);

  doc.x = left;
  doc.y = bottom + 20;
}

function pacingFacts(r: PacingResult, currency: string): string[][] {
  return [
    ["Spent to date", money(r.actualToDateMinor, currency), "Expected to date", money(r.expectedToDateMinor, currency)],
    ["Pacing (actual / expected)", formatPct(r.pacingPct), "Budget used / period elapsed", `${formatPct(r.pctBudgetConsumed, 0)} / ${formatPct(r.pctPeriodElapsed, 0)}`],
    ["Projected period-end", `${money(r.projectedMinor, currency)} (${signed(r.projectedVarianceMinor, currency)})`, "Remaining budget", money(r.remainingBudgetMinor, currency)],
    ["Required daily spend", r.requiredDailyMinor === null ? "—" : `${money(r.requiredDailyMinor, currency)} x ${r.remainingActiveDays} days`, "Current daily rate (7-day)", money(r.currentDailyRateMinor, currency)],
  ];
}

export async function renderClientReportPdf(rep: ClientReport, brand: Brand, opts: { internal: boolean; compress?: boolean; generatedAt?: Date }) {
  const { client, pacing, perf, cmpPerf, range, cmpRange, preset, history } = rep;
  const c = client.currency;
  const doc = newDoc({ title: `${client.name} advertising report`, author: brand.name, compress: opts.compress });
  const isDemo = client.accounts.some((a) => a.isDemo);
  const total = pacing.total;
  const t = perf.totals;
  const d = derive(t);
  const ct = cmpPerf?.totals;
  const cd = ct ? derive(ct) : null;

  // Title
  doc.font("Helvetica-Bold").fontSize(20).fillColor(C.text).text(pdfText(client.name), doc.page.margins.left, doc.page.margins.top);
  doc.font("Helvetica").fontSize(10).fillColor(C.text2).text(
    pdfText(`Advertising report · ${PRESET_LABEL[preset]}: ${formatDate(range.from, { month: "short", day: "numeric", year: "numeric" })} - ${formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}` +
      (cmpRange ? ` · compared with ${formatDate(cmpRange.from)} - ${formatDate(cmpRange.to)}` : "")),
  );
  if (isDemo) {
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1c5cab").text("Illustrative demo data - not real advertising results.");
  }
  doc.moveDown(0.8);

  tiles(doc, [
    { label: "Ad spend", value: money(t.costMinor, c), sub: [t.hasEstimatedCost ? "incl. estimated" : null, change(t.costMinor, ct?.costMinor)].filter(Boolean).join(" · ") || undefined },
    { label: "Monthly budget", value: total ? money(total.budgetMinor, c) : "Not set", sub: total ? STATUS_LABEL[total.status] : undefined, subColor: total ? STATUS_COLOR[total.status] : undefined },
    { label: "Conversions (platform-reported)", value: formatNumber(t.conversions, 1), sub: change(t.conversions, ct?.conversions) },
    { label: "Leads", value: formatNumber(t.leads), sub: change(t.leads, ct?.leads) },
    { label: "Cost per lead", value: d.costPerLeadMinor === null ? "—" : formatMoney(d.costPerLeadMinor, c), sub: d.costPerLeadMinor !== null && cd?.costPerLeadMinor != null ? change(d.costPerLeadMinor, cd.costPerLeadMinor) : undefined },
    { label: "ROAS", value: d.roas === null ? "—" : `${d.roas.toFixed(2)}x`, sub: d.roas === null ? "no conversion value reported" : cd?.roas != null ? change(d.roas, cd.roas) : "conversion value / spend" },
  ]);

  // Pacing
  if (total) {
    sectionTitle(doc, `Budget pacing · ${formatDate(pacing.period.start, { month: "long", year: "numeric" })}`, total.asOf ? `Complete data through ${formatDate(total.asOf)}. Status: ${STATUS_LABEL[total.status]}.` : "No complete days of data in this period yet.");
    drawPacingChart(doc, total.series, total.budgetMinor, c);
    table(doc, [{ header: "", width: 0.25 }, { header: "", width: 0.25, align: "right" }, { header: "", width: 0.27 }, { header: "", width: 0.23, align: "right" }], pacingFacts(total, c), { noHeader: true });
    const lines = [...pacing.rows, ...pacing.subRows];
    if (lines.length > 1 || opts.internal) {
      sectionTitle(doc, "Budget lines", "Sub-allocations are paced individually but already included in a parent budget.");
      const sub = new Set(pacing.subRows);
      const lineCols: Column[] = [
          { header: "Line", width: opts.internal ? 0.24 : 0.34 },
          { header: "Status", width: 0.12 },
          { header: "Budget", width: 0.1, align: "right" },
          { header: "Spent", width: 0.1, align: "right" },
          { header: "Pacing", width: 0.08, align: "right" },
          { header: "Projected", width: 0.11, align: "right" },
          { header: "Req./day", width: 0.09, align: "right" },
          ...(opts.internal ? [{ header: "Recommendation", width: 0.16 }] : []),
      ];
      // First column absorbs any rounding so widths sum to 100%.
      lineCols[0].width += 1 - lineCols.reduce((sum, x) => sum + x.width, 0);
      table(
        doc,
        lineCols,
        lines.map((r) => [
          `${r.level === "CLIENT" ? "Combined client budget" : r.label}${sub.has(r) ? " (sub-allocation)" : ""}\n${r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + ")}`,
          r.result ? STATUS_LABEL[r.result.status] : "No budget",
          money(r.result?.budgetMinor, c),
          money(r.result?.actualToDateMinor ?? r.unbudgetedSpendMinor, c),
          r.result ? formatPct(r.result.pacingPct) : "—",
          money(r.result?.projectedMinor, c),
          money(r.result?.requiredDailyMinor, c),
          ...(opts.internal ? [`${r.action.headline}. ${r.action.detail}`] : []),
        ]),
        { colors: lines.map((r) => [undefined, r.result ? STATUS_COLOR[r.result.status] : C.text3]) },
      );
    }
  } else {
    sectionTitle(doc, "Budget pacing");
    paragraph(doc, "No budget is set for this period.");
  }

  // Platforms
  sectionTitle(doc, "Platform breakdown", `${PRESET_LABEL[preset]} · conversions are platform-reported and defined differently by each platform.`);
  table(
    doc,
    [
      { header: "Account", width: 0.26 },
      { header: "Spend", width: 0.11, align: "right" },
      { header: "Impr.", width: 0.1, align: "right" },
      { header: "Clicks", width: 0.08, align: "right" },
      { header: "CTR", width: 0.07, align: "right" },
      { header: "CPC", width: 0.08, align: "right" },
      { header: "Conv.", width: 0.07, align: "right" },
      { header: "Cost/conv.", width: 0.09, align: "right" },
      { header: "Leads", width: 0.07, align: "right" },
      { header: "ROAS", width: 0.07, align: "right" },
    ],
    client.accounts.map((a) => {
      const m = perf.byAccount[a.id];
      const x = m ? derive(m) : null;
      const lsa = a.platform === "GOOGLE_LSA";
      return [
        `${PLATFORM_LABEL[a.platform]}\n${a.name}`,
        m ? `${money(m.costMinor, c)}${a.spendIsVerified ? "" : "*"}` : "—",
        lsa ? "n/a" : m ? formatNumber(m.impressions) : "—",
        lsa ? "n/a" : m ? formatNumber(m.clicks) : "—",
        lsa ? "n/a" : formatPct(x?.ctr ?? null, 2),
        lsa || x?.cpcMinor == null ? (lsa ? "n/a" : "—") : formatMoney(x.cpcMinor, c),
        m ? formatNumber(m.conversions, 1) : "—",
        x?.costPerConversionMinor == null ? "—" : formatMoney(x.costPerConversionMinor, c),
        m?.leads ? formatNumber(m.leads) : "—",
        x?.roas == null || lsa ? "—" : `${x.roas.toFixed(2)}x`,
      ];
    }),
  );
  if (client.accounts.some((a) => !a.spendIsVerified)) paragraph(doc, "* Spend is estimated or incomplete for this account (see data notes).", { size: 7.5 });

  // Campaigns
  const campaigns = client.accounts.flatMap((a) => a.campaigns.map((cmp) => ({ a, cmp, m: perf.byCampaign[cmp.id] }))).filter((x) => x.m && x.m.costMinor > 0);
  if (campaigns.length) {
    sectionTitle(doc, "Campaigns", PRESET_LABEL[preset]);
    table(
      doc,
      [
        { header: "Campaign", width: 0.36 },
        { header: "Platform", width: 0.14 },
        { header: "Spend", width: 0.11, align: "right" },
        { header: "Clicks", width: 0.09, align: "right" },
        { header: "Conv.", width: 0.09, align: "right" },
        { header: "Cost/conv.", width: 0.11, align: "right" },
        { header: "ROAS", width: 0.1, align: "right" },
      ],
      campaigns
        .sort((p, q) => q.m.costMinor - p.m.costMinor)
        .map(({ a, cmp, m }) => {
          const x = derive(m);
          return [cmp.name, PLATFORM_LABEL[a.platform], money(m.costMinor, c), formatNumber(m.clicks), formatNumber(m.conversions, 1), x.costPerConversionMinor == null ? "—" : formatMoney(x.costPerConversionMinor, c), x.roas == null ? "—" : `${x.roas.toFixed(2)}x`];
        }),
    );
  }

  // History
  sectionTitle(doc, "Historical budget performance");
  table(
    doc,
    [
      { header: "Period", width: 0.28 },
      { header: "Budget", width: 0.16, align: "right" },
      { header: "Spent", width: 0.16, align: "right" },
      { header: "Variance", width: 0.14, align: "right" },
      { header: "Used", width: 0.1, align: "right" },
      { header: "Result", width: 0.16 },
    ],
    history.map((h) => {
      const r = h.total;
      return [
        formatDate(h.period.start, { month: "long", year: "numeric" }),
        money(r?.budgetMinor, c),
        money(r?.actualToDateMinor, c),
        r ? signed(r.actualToDateMinor - r.budgetMinor, c) : "—",
        r ? formatPct(r.pctBudgetConsumed) : "—",
        r ? STATUS_LABEL[r.status] : "No budget",
      ];
    }),
    { colors: history.map((h) => [undefined, undefined, undefined, undefined, undefined, h.total ? STATUS_COLOR[h.total.status] : C.text3]) },
  );

  // Notes
  const notes = [...new Set([...pacing.rows, ...pacing.subRows].flatMap((r) => r.warnings))];
  sectionTitle(doc, "Notes");
  paragraph(
    doc,
    [
      "Pacing compares spend to date with the planned spend to date (actual / expected). Today's partial spend is excluded.",
      "Conversions and conversion value are as reported by each ad platform under its own attribution settings.",
      ...notes,
    ].map((n) => `- ${n}`).join("\n"),
  );

  const generated = (opts.generatedAt ?? new Date()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: client.timezone });
  decoratePages(doc, brand, `${client.name} · generated ${generated}${isDemo ? " · demo data" : ""}`);
  return toBuffer(doc);
}

export async function renderAgencyReportPdf(clients: ClientPacing[], s: AgencySummary, brand: Brand, opts: { compress?: boolean; generatedAt?: Date; timezone: string }) {
  const doc = newDoc({ title: "Budget pacing report", author: brand.name, compress: opts.compress, landscape: true });
  const rows = clients.flatMap((c) => c.rows);
  const c = s.currency;
  const isDemo = rows.some((r) => r.isDemo);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(C.text).text("Budget pacing report", doc.page.margins.left, doc.page.margins.top);
  doc.font("Helvetica").fontSize(10).fillColor(C.text2).text(
    pdfText(`${s.combined ? formatDate(s.combined.periodStart, { month: "long", year: "numeric" }) : ""} · ${clients.length} clients · ${rows.length} budget lines${s.typicalAsOf ? ` · data through ${formatDate(s.typicalAsOf)}` : ""}`),
  );
  if (isDemo) doc.moveDown(0.3).font("Helvetica-Bold").fontSize(8.5).fillColor("#1c5cab").text("Includes illustrative demo data.");
  doc.moveDown(0.8);
  const variance = s.projectedMinor - s.totalBudgetMinor;
  tiles(
    doc,
    [
      { label: "Total monthly budget", value: money(s.totalBudgetMinor, c) },
      { label: "Month-to-date spend", value: money(s.actualToDateMinor, c), sub: `${formatPct(s.totalBudgetMinor ? (s.actualToDateMinor / s.totalBudgetMinor) * 100 : null, 0)} of budget used` },
      { label: "Expected to date", value: money(s.expectedToDateMinor, c), sub: `Agency pacing ${formatPct(s.expectedToDateMinor ? (s.actualToDateMinor / s.expectedToDateMinor) * 100 : null)}` },
      { label: "Projected month-end", value: money(s.projectedMinor, c), sub: `${signed(variance, c)} vs budget`, subColor: variance > 0 ? C.critical : C.text2 },
      { label: "Lines requiring attention", value: `${s.rowsNeedingAttention} of ${s.rowsTotal}`, subColor: C.critical, sub: s.staleRows ? `${s.staleRows} with stale data` : "all data current" },
    ],
    5,
  );
  if (s.combined) {
    sectionTitle(doc, "Agency pacing — cumulative spend");
    drawPacingChart(doc, s.combined.series, s.combined.budgetMinor, c, 150);
  }
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  const sorted = [...rows].sort((a, b) => order[a.action.severity] - order[b.action.severity] || Math.abs(b.result?.projectedVarianceMinor ?? 0) - Math.abs(a.result?.projectedVarianceMinor ?? 0));
  sectionTitle(doc, "Client budget pacing", "Sorted by urgency. Pacing = actual spend / expected spend to date.");
  table(
    doc,
    [
      { header: "Client / line", width: 0.19 },
      { header: "Platform", width: 0.1 },
      { header: "Status", width: 0.1 },
      { header: "Budget", width: 0.07, align: "right" },
      { header: "Spent", width: 0.07, align: "right" },
      { header: "Pacing", width: 0.06, align: "right" },
      { header: "Projected", width: 0.08, align: "right" },
      { header: "Variance", width: 0.07, align: "right" },
      { header: "Recommendation", width: 0.26 },
    ],
    sorted.map((r) => [
      `${r.clientName}\n${r.level === "CLIENT" ? "Combined budget" : r.label}`,
      r.platforms.map((p) => PLATFORM_LABEL[p]).join(" + "),
      `${r.result ? STATUS_LABEL[r.result.status] : "No budget"}${r.disconnected ? "\nDisconnected" : r.stale ? "\nStale data" : ""}`,
      money(r.result?.budgetMinor, r.currency),
      money(r.result?.actualToDateMinor ?? r.unbudgetedSpendMinor, r.currency),
      r.result ? formatPct(r.result.pacingPct) : "—",
      money(r.result?.projectedMinor, r.currency),
      r.result ? signed(r.result.projectedVarianceMinor, r.currency) : "—",
      `${r.action.headline}. ${r.action.detail}`,
    ]),
    { fontSize: 7.5, colors: sorted.map((r) => [undefined, undefined, r.result ? STATUS_COLOR[r.result.status] : C.text3]) },
  );
  const generated = (opts.generatedAt ?? new Date()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: opts.timezone });
  decoratePages(doc, brand, `Internal report · generated ${generated}${isDemo ? " · includes demo data" : ""}`);
  return toBuffer(doc);
}
