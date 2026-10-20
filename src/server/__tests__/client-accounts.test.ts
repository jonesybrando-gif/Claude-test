import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { linkAccountToClient, stopTrackingAccount } from "../client-accounts";
import { createOAuthState, verifyOAuthState } from "../integrations/oauth-state";
import type { RemoteAccount } from "../integrations/types";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "client-accounts-test";
let agencyId = "";
let acme = "";
let beta = "";
let connectionId = "";

const remote = (externalId: string, name = `Account ${externalId}`): RemoteAccount => ({ externalId, name, currency: "USD", timezone: "America/Los_Angeles", isManager: false, loginCustomerId: "9999999999" });

describe.skipIf(!hasDb)("per-client ad accounts (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    agencyId = (await prisma.agency.create({ data: { name: "Accounts Test", slug: SLUG } })).id;
    acme = (await prisma.client.create({ data: { agencyId, name: "Acme", timezone: "UTC" } })).id;
    beta = (await prisma.client.create({ data: { agencyId, name: "Beta Co", timezone: "UTC" } })).id;
    connectionId = (await prisma.platformConnection.create({ data: { agencyId, platform: "GOOGLE_ADS", label: "Google Ads — Acme" } })).id;
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("links one Google Ads account, with Local Services from the same account", async () => {
    const r = await linkAccountToClient({ agencyId, clientId: acme, connectionId, remote: remote("1111111111", "Acme Search"), platforms: ["GOOGLE_ADS", "GOOGLE_LSA"] });
    expect(r).toMatchObject({ ok: true, replaced: 0 });
    const rows = await prisma.adAccount.findMany({ where: { clientId: acme }, orderBy: { platform: "asc" } });
    expect(rows.map((a) => [a.platform, a.name, a.loginCustomerId, a.status])).toEqual([
      ["GOOGLE_ADS", "Acme Search", "9999999999", "ACTIVE"],
      ["GOOGLE_LSA", "Acme Search — Local Services", "9999999999", "ACTIVE"],
    ]);
  });

  it("replaces the client's account for that platform and keeps the old one's history", async () => {
    const old = await prisma.adAccount.findFirstOrThrow({ where: { clientId: acme, platform: "GOOGLE_ADS" } });
    const r = await linkAccountToClient({ agencyId, clientId: acme, connectionId, remote: remote("2222222222"), platforms: ["GOOGLE_ADS"] });
    expect(r).toMatchObject({ ok: true, replaced: 1 });
    const active = await prisma.adAccount.findMany({ where: { clientId: acme, platform: "GOOGLE_ADS", status: "ACTIVE" } });
    expect(active.map((a) => a.externalId)).toEqual(["2222222222"]);
    expect((await prisma.adAccount.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("DISCONNECTED");
    // LSA wasn't part of this change, so it stays as it was.
    expect(await prisma.adAccount.count({ where: { clientId: acme, platform: "GOOGLE_LSA", status: "ACTIVE" } })).toBe(1);
  });

  it("re-linking a previously replaced account reactivates the same record", async () => {
    const r = await linkAccountToClient({ agencyId, clientId: acme, connectionId, remote: remote("1111111111", "Acme Search"), platforms: ["GOOGLE_ADS"] });
    expect(r).toMatchObject({ ok: true, replaced: 1 });
    expect(await prisma.adAccount.count({ where: { clientId: acme, platform: "GOOGLE_ADS" } })).toBe(2); // no duplicate rows
  });

  it("won't link an account that's live under another client, or a manager account", async () => {
    const r = await linkAccountToClient({ agencyId, clientId: beta, connectionId, remote: remote("1111111111", "Acme Search"), platforms: ["GOOGLE_ADS"] });
    expect(r).toEqual({ ok: false, error: "Acme Search is already linked to Acme. Stop tracking it there first." });
    const m = await linkAccountToClient({ agencyId, clientId: beta, connectionId, remote: { ...remote("3333333333"), isManager: true }, platforms: ["GOOGLE_ADS"] });
    expect(m.ok).toBe(false);
  });

  it("stop tracking frees the account for another client, and only works within the agency", async () => {
    const acc = await prisma.adAccount.findFirstOrThrow({ where: { clientId: acme, platform: "GOOGLE_ADS", status: "ACTIVE" } });
    expect(await stopTrackingAccount("other-agency", acme, acc.id)).toBe(false);
    expect(await stopTrackingAccount(agencyId, acme, acc.id)).toBe(true);
    const r = await linkAccountToClient({ agencyId, clientId: beta, connectionId, remote: remote("1111111111", "Acme Search"), platforms: ["GOOGLE_ADS"] });
    expect(r.ok).toBe(true);
  });

  it("carries the client through the OAuth state", async () => {
    process.env.AUTH_SECRET ??= "test-secret-for-oauth-state-0123456789";
    const { state, nonce } = await createOAuthState("u1", agencyId, "GOOGLE_ADS", acme);
    expect(await verifyOAuthState(state, nonce, "u1", "GOOGLE_ADS")).toEqual({ agencyId, clientId: acme });
    const plain = await createOAuthState("u1", agencyId, "GOOGLE_ADS");
    expect((await verifyOAuthState(plain.state, plain.nonce, "u1", "GOOGLE_ADS")).clientId).toBeNull();
  });
});

describe("public URLs behind a proxy", () => {
  it("uses APP_URL rather than the internal request address", async () => {
    const { publicUrl } = await import("../integrations/oauth-state");
    const saved = process.env.APP_URL;
    process.env.APP_URL = "https://app.marketingnexus.us";
    expect(publicUrl("/integrations/google-ads/abc", "http://localhost:8080/api/integrations/google-ads/callback?code=x").toString()).toBe("https://app.marketingnexus.us/integrations/google-ads/abc");
    delete process.env.APP_URL;
    expect(publicUrl("/login", "http://localhost:3000/x").toString()).toBe("http://localhost:3000/login");
    if (saved !== undefined) process.env.APP_URL = saved;
  });
});
