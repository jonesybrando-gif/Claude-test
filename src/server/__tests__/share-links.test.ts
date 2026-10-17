import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createShareLink, listShareLinks, recordShareView, resolveShareToken } from "../share-links";

const hasDb = !!process.env.DATABASE_URL && !!process.env.TOKEN_ENCRYPTION_KEY;
const prisma = new PrismaClient();
const SLUG = "share-links-test";
let clientId = "";
let userId = "";

describe.skipIf(!hasDb)("shared report links (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    const agency = await prisma.agency.create({ data: { name: "Share Test", slug: SLUG } });
    clientId = (await prisma.client.create({ data: { agencyId: agency.id, name: "Share Client", timezone: "UTC" } })).id;
    userId = (await prisma.user.create({ data: { agencyId: agency.id, email: "share-test@example.test", name: "T", role: "AGENCY_ADMIN" } })).id;
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("creates a link that resolves by token and stores only a hash", async () => {
    const { link, token, url } = await createShareLink({ clientId, createdById: userId, label: "Dana", range: "last_month", expiresInDays: 30 });
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(url).toMatch(new RegExp(`/r/${token}$`));
    expect(link.tokenHash).not.toContain(token);
    expect(link.tokenEnc).not.toContain(token);
    expect(link.range).toBe("last_month");
    expect((await resolveShareToken(token))?.id).toBe(link.id);
    const [listed] = await listShareLinks(clientId);
    expect(listed.url).toBe(url);
    expect(listed).not.toHaveProperty("tokenHash");
    expect(listed).not.toHaveProperty("tokenEnc");
  });

  it("rejects unknown, malformed, expired and turned-off links", async () => {
    expect(await resolveShareToken("x".repeat(32))).toBeNull();
    expect(await resolveShareToken("../../etc")).toBeNull();
    const past = new Date(Date.now() - 10 * 86_400_000);
    const { token: old } = await createShareLink({ clientId, createdById: userId, label: null, range: "template", expiresInDays: 7, now: past });
    expect(await resolveShareToken(old)).toBeNull();
    const { link, token } = await createShareLink({ clientId, createdById: userId, label: null, range: "template", expiresInDays: null });
    expect(link.range).toBeNull();
    expect(await resolveShareToken(token)).not.toBeNull();
    await prisma.reportShareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    expect(await resolveShareToken(token)).toBeNull();
  });

  it("stops working when the client is archived, and counts views", async () => {
    const { link, token } = await createShareLink({ clientId, createdById: userId, label: null, range: "template", expiresInDays: null });
    await recordShareView(link.id);
    await recordShareView(link.id);
    const after = await prisma.reportShareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(after.viewCount).toBe(2);
    expect(after.lastViewedAt).not.toBeNull();
    await prisma.client.update({ where: { id: clientId }, data: { archivedAt: new Date() } });
    expect(await resolveShareToken(token)).toBeNull();
    await prisma.client.update({ where: { id: clientId }, data: { archivedAt: null } });
  });
});
