import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CampaignSelectionError, setAllCampaignsIncluded, setCampaignIncluded, setIncludeNewCampaigns } from "../campaign-selection";
import { getClientPerformance } from "../reporting";
import { getAgencyPerformance } from "../performance";
import { clientDailyCsv } from "../exports";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "campaign-selection-test";
const range = { from: "2026-09-01", to: "2026-09-30" };
let agencyId = "";
let otherAgencyId = "";
let clientId = "";
let accountId = "";
let search = "";
let display = "";

describe.skipIf(!hasDb)("adding and removing campaigns (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: { in: [SLUG, `${SLUG}-other`] } } });
    agencyId = (await prisma.agency.create({ data: { name: "Selection", slug: SLUG } })).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: "Other", slug: `${SLUG}-other` } })).id;
    clientId = (await prisma.client.create({ data: { agencyId, name: "Sel Client", timezone: "UTC" } })).id;
    accountId = (await prisma.adAccount.create({ data: { clientId, platform: "GOOGLE_ADS", externalId: "5", name: "Sel Ads", currency: "USD" } })).id;
    search = (await prisma.campaign.create({ data: { accountId, externalId: "1", name: "Search" } })).id;
    display = (await prisma.campaign.create({ data: { accountId, externalId: "2", name: "Display" } })).id;
    const day = new Date("2026-09-10T00:00:00Z");
    await prisma.dailyPerformance.createMany({
      data: [
        { accountId, campaignId: search, date: day, currency: "USD", costMinor: 10000n, clicks: 10n, conversions: 2 },
        { accountId, campaignId: display, date: day, currency: "USD", costMinor: 5000n, clicks: 50n, conversions: 0 },
        { accountId, campaignId: null, date: day, currency: "USD", costMinor: 100n, clicks: 1n, conversions: 0 },
      ],
    });
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: { in: [SLUG, `${SLUG}-other`] } } });
    await prisma.$disconnect();
  });

  it("leaves a removed campaign out of reports and exports, and adds it back", async () => {
    expect((await getClientPerformance(clientId, range)).totals.costMinor).toBe(15100);
    expect(await setCampaignIncluded(agencyId, clientId, display, false)).toBe("Display");

    const perf = await getClientPerformance(clientId, range);
    expect(perf.totals.costMinor).toBe(10100); // account-level rows still count
    expect(perf.byCampaign[display]).toBeUndefined();
    expect((await getAgencyPerformance({ agencyId }, range)).totals.costMinor).toBe(10100);
    expect(await clientDailyCsv(clientId, range)).not.toContain("Display");

    await setCampaignIncluded(agencyId, clientId, display, true);
    expect((await getClientPerformance(clientId, range)).totals.costMinor).toBe(15100);
  });

  it("keeps campaigns with their own budget, and only for the client's own agency", async () => {
    await prisma.budget.create({ data: { clientId, scope: "CAMPAIGN", accountId, campaignId: search, periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), currency: "USD" } });
    await expect(setCampaignIncluded(agencyId, clientId, search, false)).rejects.toThrow(/has its own budget/);
    expect(await setAllCampaignsIncluded(agencyId, clientId, accountId, false)).toBe(1);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: search } })).excludedAt).toBeNull();
    expect(await setAllCampaignsIncluded(agencyId, clientId, accountId, true)).toBe(1);

    await expect(setCampaignIncluded(otherAgencyId, clientId, display, false)).rejects.toBeInstanceOf(CampaignSelectionError);
    await expect(setIncludeNewCampaigns(otherAgencyId, clientId, accountId, false)).rejects.toBeInstanceOf(CampaignSelectionError);
    await setIncludeNewCampaigns(agencyId, clientId, accountId, false);
    expect((await prisma.adAccount.findUniqueOrThrow({ where: { id: accountId } })).includeNewCampaigns).toBe(false);
  });
});
