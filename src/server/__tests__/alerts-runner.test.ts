// Integration test for the alert runner against the real database.
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { evaluateAgencyAlerts, sendDailySummaries } from "../alerts";
import { addDays, eachDay, isoToDate, todayInTimeZone } from "@/lib/pacing/dates";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "alerts-runner-test";
// Monday 2026-10-19, 08:30 in New York
const NOW = new Date("2026-10-19T12:30:00Z");

let ids: { agency: string; admin: string; manager: string; clientA: string; clientB: string; accA: string; accB: string };

async function setup() {
  delete process.env.SMTP_URL;
  await prisma.agency.deleteMany({ where: { slug: SLUG } });
  const agency = await prisma.agency.create({ data: { name: "Runner Test", slug: SLUG, defaultTimezone: "America/New_York" } });
  const admin = await prisma.user.create({ data: { agencyId: agency.id, email: "runner-admin@test.local", name: "Admin", role: "AGENCY_ADMIN", passwordHash: "x" } });
  const manager = await prisma.user.create({ data: { agencyId: agency.id, email: "runner-am@test.local", name: "AM", role: "ACCOUNT_MANAGER", passwordHash: "x", emailAlerts: false } });
  const clientA = await prisma.client.create({ data: { agencyId: agency.id, name: "Client A", timezone: "America/New_York", assignments: { create: [{ userId: manager.id }] } } });
  const clientB = await prisma.client.create({ data: { agencyId: agency.id, name: "Client B", timezone: "America/New_York" } });
  const conn = await prisma.platformConnection.create({ data: { agencyId: agency.id, platform: "GOOGLE_ADS", label: "t" } });
  const yesterday = addDays(todayInTimeZone("America/New_York", NOW), -1);
  const accA = await prisma.adAccount.create({
    data: { clientId: clientA.id, connectionId: conn.id, platform: "GOOGLE_ADS", externalId: "1111111111", name: "A – Google", currency: "USD", timezone: "America/New_York", lastSuccessfulSyncAt: new Date(NOW.getTime() - 3600_000), dataCompleteThrough: isoToDate(yesterday) },
  });
  const accB = await prisma.adAccount.create({
    data: { clientId: clientB.id, connectionId: conn.id, platform: "GOOGLE_ADS", externalId: "2222222222", name: "B – Google", currency: "USD", status: "NEEDS_REAUTH", lastSuccessfulSyncAt: new Date(NOW.getTime() - 50 * 3600_000) },
  });
  // Account A spent $100/day, then nothing for the last two complete days.
  const days = eachDay(addDays(yesterday, -20), addDays(yesterday, -2));
  await prisma.dailyPerformance.createMany({ data: days.map((d) => ({ accountId: accA.id, date: isoToDate(d), currency: "USD", costMinor: 10000n })) });
  ids = { agency: agency.id, admin: admin.id, manager: manager.id, clientA: clientA.id, clientB: clientB.id, accA: accA.id, accB: accB.id };
}

describe.skipIf(!hasDb)("alert runner (database)", () => {
  beforeEach(setup);
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.emailMessage.deleteMany({ where: { to: { endsWith: "@test.local" } } });
    await prisma.$disconnect();
  });

  it("creates alerts, notifies only people who can see the client, and never repeats", async () => {
    const first = await evaluateAgencyAlerts(ids.agency, NOW);
    const alerts = await prisma.alert.findMany({ where: { agencyId: ids.agency }, orderBy: { type: "asc" } });
    expect(alerts.map((a) => `${a.type}:${a.status}`).sort()).toEqual(["ACCOUNT_DISCONNECTED:OPEN", "SPEND_STOPPED:OPEN"]);
    expect(first.created).toBe(2);

    const adminNotes = await prisma.notification.count({ where: { userId: ids.admin } });
    const amNotes = await prisma.notification.findMany({ where: { userId: ids.manager } });
    expect(adminNotes).toBe(2); // admins see every client
    expect(amNotes.map((n) => n.title)).toEqual([expect.stringContaining("Client A")]); // manager only sees assigned client
    // Admin has email alerts on, manager has them off
    expect(await prisma.emailMessage.count({ where: { to: "runner-admin@test.local", kind: "alert" } })).toBe(1);
    expect(await prisma.emailMessage.count({ where: { to: "runner-am@test.local", kind: "alert" } })).toBe(0);

    const second = await evaluateAgencyAlerts(ids.agency, new Date(NOW.getTime() + 3600_000));
    expect(second).toMatchObject({ created: 0, refreshed: 2, resolved: 0, emailsQueued: 0 });
    expect(await prisma.notification.count({ where: { userId: ids.admin } })).toBe(2);
  });

  it("resolves an alert when the condition clears, and re-opens it as a new alert if it returns", async () => {
    await evaluateAgencyAlerts(ids.agency, NOW);
    await prisma.adAccount.update({ where: { id: ids.accB }, data: { status: "ACTIVE", lastSuccessfulSyncAt: NOW } });
    const r = await evaluateAgencyAlerts(ids.agency, NOW);
    expect(r.resolved).toBe(1);
    const b = await prisma.alert.findFirstOrThrow({ where: { accountId: ids.accB } });
    expect(b.status).toBe("RESOLVED");
    await prisma.adAccount.update({ where: { id: ids.accB }, data: { status: "NEEDS_REAUTH" } });
    expect((await evaluateAgencyAlerts(ids.agency, NOW)).created).toBe(1);
  });

  it("an acknowledged alert stays open without new notifications", async () => {
    await evaluateAgencyAlerts(ids.agency, NOW);
    await prisma.alert.updateMany({ where: { agencyId: ids.agency }, data: { status: "ACKNOWLEDGED" } });
    const r = await evaluateAgencyAlerts(ids.agency, NOW);
    expect(r).toMatchObject({ created: 0, refreshed: 2 });
    expect((await prisma.alert.findMany({ where: { agencyId: ids.agency } })).every((a) => a.status === "ACKNOWLEDGED")).toBe(true);
  });

  it("sends daily summaries on weekday mornings, once per person per day", async () => {
    expect(await sendDailySummaries(ids.agency, NOW)).toBe(2);
    expect(await sendDailySummaries(ids.agency, new Date(NOW.getTime() + 2 * 3600_000))).toBe(0); // same day
    expect(await sendDailySummaries(ids.agency, new Date("2026-10-20T10:00:00Z"))).toBe(0); // 6am next day: too early
    expect(await sendDailySummaries(ids.agency, new Date("2026-10-20T12:00:00Z"))).toBe(2); // 8am next day
    expect(await sendDailySummaries(ids.agency, new Date("2026-10-24T13:00:00Z"))).toBe(0); // Saturday
    const summary = await prisma.emailMessage.findFirstOrThrow({ where: { to: "runner-am@test.local", kind: "daily_summary" } });
    expect(summary.status).toBe("NOT_CONFIGURED");
    expect(summary.text).not.toContain("Client B"); // manager's summary only covers their clients
  });
});
