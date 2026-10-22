import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadPacing, summarize } from "../pacing-service";
import { monthBounds, isoToDate, todayInTimeZone } from "@/lib/pacing/dates";
import { slackAlertText, SLACK_WEBHOOK_RE, postToSlack } from "../slack";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "not-connected-test";
let agencyId = "";

describe.skipIf(!hasDb)("budget lines with no ad account data (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    agencyId = (await prisma.agency.create({ data: { name: "NC", slug: SLUG } })).id;
    const month = monthBounds(todayInTimeZone("UTC"));
    const budget = (clientId: string) => ({ clientId, scope: "CLIENT" as const, periodStart: isoToDate(month.start), periodEnd: isoToDate(month.end), currency: "USD", revisions: { create: [{ amountMinor: 500000n, effectiveDate: isoToDate(month.start) }] } });
    // One client with a budget and no ad accounts; one with a demo account that has data.
    const empty = await prisma.client.create({ data: { agencyId, name: "Empty Co", timezone: "UTC" } });
    await prisma.budget.create({ data: budget(empty.id) });
    const live = await prisma.client.create({ data: { agencyId, name: "Live Co", timezone: "UTC" } });
    await prisma.adAccount.create({ data: { clientId: live.id, platform: "GOOGLE_ADS", externalId: "1", name: "Ads", currency: "USD", isDemo: true } });
    await prisma.budget.create({ data: budget(live.id) });
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("marks them not connected, never needing attention, and leaves them out of the headline figures", async () => {
    const pacing = await loadPacing({ agencyId });
    const empty = pacing.find((p) => p.client.name === "Empty Co")!.rows[0];
    const live = pacing.find((p) => p.client.name === "Live Co")!.rows[0];
    expect([empty.notConnected, empty.attention]).toEqual([true, false]);
    expect(live.notConnected).toBe(false);
    const s = summarize(pacing);
    expect(s.notConnectedRows).toBe(1);
    expect(s.rowsTotal).toBe(1);
    expect(s.totalBudgetMinor).toBe(500000);
  });
});

describe("Slack alerts", () => {
  it("formats a batch with severities, escaping and a link", () => {
    const text = slackAlertText([{ severity: "critical", client: "A&B", title: "Total budget: projected to overspend by $500" }, { severity: "warning", client: "C", title: "Ads: spending stopped" }], "https://app.test/alerts");
    expect(text).toBe("2 new alerts\n:red_circle: *A&amp;B*: Total budget: projected to overspend by $500\n:large_orange_circle: *C*: Ads: spending stopped\n<https://app.test/alerts|Open alerts>");
  });

  it("only posts to Slack webhook URLs and never throws", async () => {
    expect(SLACK_WEBHOOK_RE.test("https://hooks.slack.com/services/T0/B0/xyz")).toBe(true);
    expect(SLACK_WEBHOOK_RE.test("https://evil.test/services/x")).toBe(false);
    let calls = 0;
    const f = (async () => { calls++; throw new Error("down"); }) as typeof fetch;
    expect(await postToSlack("https://evil.test/x", "hi", f)).toBe(false);
    expect(await postToSlack("https://hooks.slack.com/services/T0/B0/xyz", "hi", f)).toBe(false);
    expect(calls).toBe(1);
  });
});
