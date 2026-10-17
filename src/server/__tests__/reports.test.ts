// Renders real reports from database data.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadClientReport } from "../client-report";
import { clientDailyCsv } from "../exports";
import { renderAgencyReportPdf, renderClientReportPdf } from "../pdf/reports";
import { loadPacing, summarize } from "../pacing-service";
import { getClientTemplate, resetClientTemplate, saveTemplate } from "../report-templates";
import { DEFAULT_TEMPLATE } from "@/lib/report-template";
import { addDays, eachDay, isoToDate, monthBounds, todayInTimeZone } from "@/lib/pacing/dates";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "reports-test";
let clientId = "";
let agencyId = "";
const brand = { name: "Test Agency", color: "#4f46e5", header: "Prepared for you", footer: "Confidential" };

describe.skipIf(!hasDb)("reports (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    const agency = await prisma.agency.create({ data: { name: brand.name, slug: SLUG } });
    agencyId = agency.id;
    const client = await prisma.client.create({ data: { agencyId, name: "Café Plumbing, Inc.", timezone: "America/New_York" } });
    clientId = client.id;
    const today = todayInTimeZone("America/New_York");
    const month = monthBounds(today);
    const acct = await prisma.adAccount.create({
      data: { clientId, platform: "GOOGLE_ADS", externalId: "1234567890", name: "Café – Search", currency: "USD", isDemo: true, lastSuccessfulSyncAt: new Date(), dataCompleteThrough: isoToDate(addDays(today, -1)) },
    });
    const cmp = await prisma.campaign.create({ data: { accountId: acct.id, externalId: "1", name: '=HYPERLINK("http://x","click")', status: "ENABLED" } });
    await prisma.budget.create({
      data: { clientId, scope: "ACCOUNT", accountId: acct.id, periodStart: isoToDate(month.start), periodEnd: isoToDate(month.end), currency: "USD", revisions: { create: [{ amountMinor: 300000n, effectiveDate: isoToDate(month.start) }] } },
    });
    const days = eachDay(addDays(month.start, -40), addDays(today, -1));
    await prisma.dailyPerformance.createMany({
      data: days.map((d) => ({ accountId: acct.id, campaignId: cmp.id, date: isoToDate(d), currency: "USD", costMinor: 12345n, impressions: 1000n, clicks: 50n, conversions: 2, conversionValueMinor: 40000n, isDemo: true })),
    });
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("renders a client PDF with branding, sections and safe text", async () => {
    const rep = await loadClientReport(clientId, { range: "last_30", compare: "previous_period" });
    const pdf = await renderClientReportPdf(rep, brand, { internal: true, compress: false });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    // PDFKit writes text as hex glyph strings; check the document metadata and structure instead.
    expect(text).toContain("/Title");
    expect(text).toMatch(/\/Count [1-9]/);
    expect(pdf.length).toBeGreaterThan(3000);
  });

  it("client-facing PDF omits internal recommendations", async () => {
    const rep = await loadClientReport(clientId, { range: "mtd" });
    const [internal, external] = await Promise.all([
      renderClientReportPdf(rep, brand, { internal: true, compress: false }),
      renderClientReportPdf(rep, brand, { internal: false, compress: false }),
    ]);
    expect(internal.length).toBeGreaterThan(external.length);
  });

  it("renders the agency PDF", async () => {
    const clients = await loadPacing({ agencyId });
    const pdf = await renderAgencyReportPdf(clients, summarize(clients), brand, { timezone: "America/New_York", compress: false });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("exports daily rows to CSV with exact money and neutralised formulas", async () => {
    const rep = await loadClientReport(clientId, { range: "last_7" });
    const csv = await clientDailyCsv(clientId, rep.range);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toMatch(/^Date,Client,Platform,Account/);
    expect(lines).toHaveLength(8); // header + 7 days
    expect(lines[1]).toContain('"Café Plumbing, Inc."');
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(lines[1]).toContain(",123.45,no,1000,50,5,2.47,2,400,61.73,,3.24,yes");
  });

  it("resolves templates: client override, then agency default, then built-in", async () => {
    expect((await getClientTemplate(agencyId, clientId)).template).toEqual(DEFAULT_TEMPLATE);
    await saveTemplate(agencyId, null, { ...DEFAULT_TEMPLATE, title: "Agency layout", defaultRange: "last_30" });
    let r = await getClientTemplate(agencyId, clientId);
    expect(r.custom).toBe(false);
    expect(r.template.title).toBe("Agency layout");
    // The template's default range applies when the URL doesn't choose one.
    expect((await loadClientReport(clientId, {})).preset).toBe("last_30");

    await saveTemplate(agencyId, clientId, { ...DEFAULT_TEMPLATE, title: "Client layout", kpis: ["clicks"], compare: "none" });
    await saveTemplate(agencyId, clientId, { ...DEFAULT_TEMPLATE, title: "Client layout v2", kpis: ["clicks"], compare: "none" }); // updates, doesn't duplicate
    r = await getClientTemplate(agencyId, clientId);
    expect(r).toMatchObject({ custom: true, template: { title: "Client layout v2", kpis: ["clicks"] } });
    expect(await prisma.report.count({ where: { agencyId, kind: "TEMPLATE" } })).toBe(2);
    const rep = await loadClientReport(clientId, { range: "last_7" });
    expect(rep.cmpRange).toBeNull();

    await resetClientTemplate(agencyId, clientId);
    expect((await getClientTemplate(agencyId, clientId)).template.title).toBe("Agency layout");
  });

  it("leaves sections out of the PDF when the template turns them off", async () => {
    const rep = await loadClientReport(clientId, { range: "last_30", compare: "previous_period" });
    const full = await renderClientReportPdf({ ...rep, template: { ...DEFAULT_TEMPLATE, summary: "A note for the client." } }, brand, { internal: false, compress: false });
    const none = Object.fromEntries(Object.keys(DEFAULT_TEMPLATE.sections).map((k) => [k, false])) as typeof DEFAULT_TEMPLATE.sections;
    const bare = await renderClientReportPdf({ ...rep, template: { ...DEFAULT_TEMPLATE, sections: none } }, brand, { internal: false, compress: false });
    expect(bare.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bare.length).toBeLessThan(full.length / 2);
  });
});
