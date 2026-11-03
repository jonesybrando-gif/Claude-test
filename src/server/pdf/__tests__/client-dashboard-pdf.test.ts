import { describe, expect, it, vi } from "vitest";

// Pure rendering: no database needed.
vi.mock("@/server/db", () => ({ prisma: {} }));
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { polishedOctoberReport } from "@/test/report-fixture";
import { newDoc, toBuffer, decoratePages } from "../primitives";
import { drawBand, drawBudgetCard, drawCampaignTable, drawClientHeader, drawDailyChart, drawKpiTiles, drawSpendRing } from "../client-dashboard";

/** Text drawn into an uncompressed PDF (Helvetica writes it as hex strings inside TJ operators). */
function pdfStrings(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const hex = [...raw.matchAll(/<([0-9a-f]+)>/gi)].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
  // Streams may still be deflated by PDFKit; inflate any we find.
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap((m) => {
    try {
      return [inflateSync(Buffer.from(m[1], "latin1")).toString("latin1")];
    } catch {
      return [];
    }
  });
  const inner = streams.flatMap((s) => [...s.matchAll(/<([0-9a-f]+)>/gi)].map((m) => Buffer.from(m[1], "hex").toString("latin1")));
  return [...hex, ...inner].join("");
}

describe("client report PDF dashboard", () => {
  it("draws the header, budget, tiles, chart, ring and campaign table from the report's figures", async () => {
    const rep = polishedOctoberReport();
    const doc = newDoc({ title: "test", author: "test", compress: false });
    drawClientHeader(doc, { name: rep.client.name, logo: null, kicker: "Advertising performance report", period: "Last month: Oct 1, 2026 - Oct 31, 2026", demo: false });
    drawBudgetCard(doc, rep);
    drawKpiTiles(doc, rep);
    drawBand(doc, "Spend and results", "Day by day, and where the budget went");
    drawDailyChart(doc, rep);
    drawSpendRing(doc, rep);
    drawBand(doc, "Campaigns", "Change shown against the previous period");
    drawCampaignTable(doc, rep);
    decoratePages(doc, { name: rep.client.name, color: "#c2410c" }, "footer", { firstPageHeader: false });
    const buf = await toBuffer(doc);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
    const text = pdfStrings(buf);
    for (const s of ["PG", "$3,620", "of $3,300", "Spend and results", "Where the budget went", "Lead form Campaign", "Total", "+12% so far", "$54.34"]) expect(text).toContain(s);
    expect(text).not.toContain("Old campaign that never ran");
  });
});
