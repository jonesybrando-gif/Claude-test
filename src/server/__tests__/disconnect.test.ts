import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { disconnectPlatformConnection } from "../integrations/disconnect";
import { encryptSecret } from "../crypto";

const hasDb = !!process.env.DATABASE_URL && !!process.env.TOKEN_ENCRYPTION_KEY;
const prisma = new PrismaClient();
const SLUG = "disconnect-test";
let agencyId = "";

async function googleConnection(label: string) {
  const c = await prisma.platformConnection.create({ data: { agencyId, platform: "GOOGLE_ADS", label, status: "ACTIVE" } });
  await prisma.oAuthCredential.create({ data: { connectionId: c.id, encryptedRefreshToken: encryptSecret(`refresh-${label}`) } });
  return c.id;
}

describe.skipIf(!hasDb)("disconnecting a platform login (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    agencyId = (await prisma.agency.create({ data: { name: "Disconnect", slug: SLUG } })).id;
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("doesn't revoke at Google while another Google connection is active, then revokes the last one", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      calls.push(String(init?.body));
      return new Response("", { status: 200 });
    }) as typeof fetch;
    const a = await googleConnection("A");
    const b = await googleConnection("B");

    // Revoking A at Google would also kill B if both use the same Google login.
    expect(await disconnectPlatformConnection(agencyId, a, { fetch: fakeFetch })).toEqual({ revokedAtGoogle: false });
    expect(calls).toEqual([]);
    expect((await prisma.platformConnection.findUniqueOrThrow({ where: { id: a } })).status).toBe("DISCONNECTED");
    expect(await prisma.oAuthCredential.count({ where: { connectionId: a } })).toBe(0);
    expect(await prisma.oAuthCredential.count({ where: { connectionId: b } })).toBe(1);

    expect(await disconnectPlatformConnection(agencyId, b, { fetch: fakeFetch })).toEqual({ revokedAtGoogle: true });
    expect(calls).toEqual(["token=refresh-B"]);
  });
});
