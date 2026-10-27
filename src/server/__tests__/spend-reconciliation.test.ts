// Budget pacing and ad totals must reconcile: spend in budget lines + spend
// outside them = ad spend, even when an account is budgeted campaign by campaign.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadPacing, summarize } from "../pacing-service";
import { getAgencyPerformance } from "../performance";
import { addDays, eachDay, isoToDate } from "@/lib/pacing/dates";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "spend-reconciliation-test";
const NOW = new Date("2026-10-20T12:00:00Z");
const MONTH_START = "2026-10-01";
const YESTERDAY = "2026-10-19";
let clientId = "";

describe.skipIf(!hasDb)("spend reconciliation (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    const agency = await prisma.agency.create({ data: { name: "Recon", slug: SLUG } });
    clientId = (await prisma.client.create({ data: { agencyId: agency.id, name: "Board and Brew test", timezone: "UTC" } })).id;
    const acct = await prisma.adAccount.create({
      data: { clientId, platform: "GOOGLE_ADS", externalId: "42", name: "Ads", currency: "USD", timezone: "UTC", lastSuccessfulSyncAt: NOW, dataCompleteThrough: isoToDate(YESTERDAY) },
    });
    const [c1, c2, c3] = await Promise.all(
      ["Brand", "Search", "Unbudgeted promo"].map((name, i) => prisma.campaign.create({ data: { accountId: acct.id, externalId: String(i + 1), name, status: "ENABLED" } })),
    );
    for (const c of [c1, c2]) {
      const b = await prisma.budget.create({ data: { clientId, scope: "CAMPAIGN", accountId: acct.id, campaignId: c.id, periodStart: isoToDate(MONTH_START), periodEnd: isoToDate("2026-10-31"), currency: "USD" } });
      await prisma.budgetRevision.create({ data: { budgetId: b.id, amountMinor: 300000n, effectiveDate: isoToDate(MONTH_START) } });
    }
    const days = eachDay(MONTH_START, YESTERDAY);
    await prisma.dailyPerformance.createMany({
      data: days.flatMap((d) => [
        { accountId: acct.id, campaignId: c1.id, date: isoToDate(d), currency: "USD", costMinor: 5000n, impressions: 10n, clicks: 1n, conversions: 0, conversionValueMinor: 0n },
        { accountId: acct.id, campaignId: c2.id, date: isoToDate(d), currency: "USD", costMinor: 7000n, impressions: 10n, clicks: 1n, conversions: 0, conversionValueMinor: 0n },
        { accountId: acct.id, campaignId: c3.id, date: isoToDate(d), currency: "USD", costMinor: 1100n, impressions: 10n, clicks: 1n, conversions: 0, conversionValueMinor: 0n },
      ]),
    });
    // An account-level row (e.g. Local Services), outside every campaign.
    await prisma.dailyPerformance.create({ data: { accountId: acct.id, campaignId: null, date: isoToDate(addDays(YESTERDAY, -1)), currency: "USD", costMinor: 2500n, impressions: 0n, clicks: 0n, conversions: 0, conversionValueMinor: 0n } });
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("budget-line spend + spend outside budget lines = ad spend", async () => {
    const pacing = await loadPacing({ id: clientId }, NOW);
    const s = summarize(pacing);
    const perf = await getAgencyPerformance({ id: clientId }, { from: MONTH_START, to: YESTERDAY });
    const days = eachDay(MONTH_START, YESTERDAY).length;
    expect(s.actualToDateMinor).toBe((5000 + 7000) * days);
    expect(s.unbudgetedSpendMinor).toBe(1100 * days + 2500);
    expect(s.actualToDateMinor + s.unbudgetedSpendMinor).toBe(perf.totals.costMinor);
    const outside = pacing[0].rows.find((r) => r.key.startsWith("unbudgeted-campaigns:"));
    expect(outside?.label).toBe("Ads (campaigns without a budget)");
  });
});
