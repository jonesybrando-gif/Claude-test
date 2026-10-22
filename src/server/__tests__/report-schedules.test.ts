import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { nextRunAfter, parseRecipients, runDueSchedules, saveSchedule, ScheduleError } from "../report-schedules";
import { hasShareAccess, shareCookieValue } from "../share-access";
import { fetchLogo } from "../pdf/primitives";
import { setTransportForTests } from "../email";
import { addDays, eachDay, isoToDate, todayInTimeZone } from "@/lib/pacing/dates";

describe("scheduled report timing", () => {
  it("sends at 8:00 local on the chosen day, rolling to next month once passed", () => {
    // 8:00 in Los Angeles on Nov 2 2026 (PST, UTC-8) = 16:00 UTC.
    expect(nextRunAfter(2, "America/Los_Angeles", new Date("2026-10-21T12:00:00Z")).toISOString()).toBe("2026-11-02T16:00:00.000Z");
    // Oct 2 (PDT, UTC-7) has passed on Oct 21, so the next is Nov 2.
    expect(nextRunAfter(2, "America/Los_Angeles", new Date("2026-10-01T12:00:00Z")).toISOString()).toBe("2026-10-02T15:00:00.000Z");
    expect(nextRunAfter(15, "UTC", new Date("2026-12-20T00:00:00Z")).toISOString()).toBe("2027-01-15T08:00:00.000Z");
    // Exactly at send time: the next one is a month later.
    expect(nextRunAfter(15, "UTC", new Date("2027-01-15T08:00:00Z")).toISOString()).toBe("2027-02-15T08:00:00.000Z");
  });

  it("validates recipients", () => {
    expect(parseRecipients("A@x.com, b@y.org; a@x.com")).toEqual(["a@x.com", "b@y.org"]);
    expect(() => parseRecipients("")).toThrow(ScheduleError);
    expect(() => parseRecipients("not-an-email")).toThrow(/isn't a valid email/);
  });
});

describe("share link passwords", () => {
  it("accepts only the cookie made for that link and password", () => {
    process.env.AUTH_SECRET ??= "test-secret-for-share-links-0123456789";
    const link = { id: "l1", passwordHash: "$2a$12$abc" };
    expect(hasShareAccess({ id: "l1", passwordHash: null }, undefined)).toBe(true);
    expect(hasShareAccess(link, undefined)).toBe(false);
    expect(hasShareAccess(link, shareCookieValue("l1", "$2a$12$abc"))).toBe(true);
    expect(hasShareAccess(link, shareCookieValue("l2", "$2a$12$abc"))).toBe(false);
    expect(hasShareAccess(link, shareCookieValue("l1", "$2a$12$changed"))).toBe(false);
  });
});

describe("uploaded logos", () => {
  it("reads data: URLs without fetching", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    expect(await fetchLogo(`data:image/png;base64,${png.toString("base64")}`)).toEqual(png);
    expect(await fetchLogo("data:text/html;base64,PGh0bWw+")).toBeNull();
  });
});

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "report-schedules-test";

describe.skipIf(!hasDb)("sending scheduled reports (database)", () => {
  let clientId = "";
  let agencyId = "";
  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "test-secret-for-share-links-0123456789";
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    agencyId = (await prisma.agency.create({ data: { name: "Sched Agency", slug: SLUG } })).id;
    const admin = await prisma.user.create({ data: { agencyId, email: `admin@${SLUG}.test`, name: "Admin", role: "AGENCY_ADMIN" } });
    clientId = (await prisma.client.create({ data: { agencyId, name: "Sched Client", timezone: "UTC" } })).id;
    const acct = await prisma.adAccount.create({ data: { clientId, platform: "GOOGLE_ADS", externalId: "9", name: "Ads", currency: "USD", isDemo: true } });
    const today = todayInTimeZone("UTC");
    await prisma.dailyPerformance.createMany({ data: eachDay(addDays(today, -70), addDays(today, -1)).map((d) => ({ accountId: acct.id, date: isoToDate(d), currency: "USD", costMinor: 10000n, impressions: 100n, clicks: 5n, conversions: 1, isDemo: true })) });
    await saveSchedule(agencyId, clientId, { dayOfMonth: 2, recipients: "owner@client.test, cfo@client.test", range: "last_month", attachPdf: true, includeLink: true, active: true, userId: admin.id });
  });
  afterAll(async () => {
    setTransportForTests(null);
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("emails each recipient the summary, a 90-day link and the PDF, then schedules next month", async () => {
    const sent: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
    process.env.EMAIL_FROM ??= "reports@agency.test";
    setTransportForTests({ sendMail: async (m: (typeof sent)[number]) => { sent.push(m); return {}; } } as never);
    const due = new Date(Date.now() + 40 * 86_400_000); // past the next send time
    expect(await runDueSchedules(due)).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(["owner@client.test", "cfo@client.test"]);
    expect(sent[0].subject).toMatch(/^Sched Client: advertising report, /);
    expect(sent[0].html).toContain("View the full report");
    expect(sent[0].attachments?.[0].filename).toMatch(/^Sched Client - .+\.pdf$/);
    expect(sent[0].attachments?.[0].content.subarray(0, 4).toString()).toBe("%PDF");
    const s = await prisma.clientReportSchedule.findUniqueOrThrow({ where: { clientId } });
    expect(s.lastStatus).toBe("Sent to 2");
    expect(s.nextRunAt.getTime()).toBeGreaterThan(due.getTime());
    const link = await prisma.reportShareLink.findFirstOrThrow({ where: { clientId } });
    expect(link.label).toMatch(/scheduled/);
    // The stored copy of the email doesn't keep the live link.
    const stored = await prisma.emailMessage.findFirstOrThrow({ where: { agencyId, kind: "scheduled_report" } });
    expect(stored.text).toContain("[link removed]");
  });
});
