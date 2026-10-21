import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { archiveClient, bulkLabel, ClientAdminError, createLabel, deleteClientPermanently, deleteLabel, restoreClient, setClientLabels } from "../client-admin";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "client-admin-test";
let agencyId = "";
let otherAgencyId = "";
let clientId = "";

describe.skipIf(!hasDb)("removing clients and labels (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: { in: [SLUG, `${SLUG}-other`] } } });
    agencyId = (await prisma.agency.create({ data: { name: "Admin", slug: SLUG } })).id;
    otherAgencyId = (await prisma.agency.create({ data: { name: "Other", slug: `${SLUG}-other` } })).id;
    clientId = (await prisma.client.create({ data: { agencyId, name: "Rem Client", timezone: "UTC" } })).id;
    await prisma.adAccount.create({ data: { clientId, platform: "GOOGLE_ADS", externalId: "77", name: "Ads", currency: "USD" } });
    await prisma.reportShareLink.create({ data: { clientId, tokenHash: `hash-${SLUG}`, tokenEnc: "x" } });
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: { in: [SLUG, `${SLUG}-other`] } } });
    await prisma.$disconnect();
  });

  it("removes a client (accounts stop syncing), restores it, and deletes only removed clients", async () => {
    await expect(deleteClientPermanently(agencyId, clientId)).rejects.toThrow(/Remove the client first/);
    await expect(archiveClient(otherAgencyId, clientId)).rejects.toBeInstanceOf(ClientAdminError);

    expect(await archiveClient(agencyId, clientId)).toBe("Rem Client");
    const removed = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { accounts: true, shareLinks: true } });
    expect(removed.archivedAt).not.toBeNull();
    expect(removed.accounts.every((a) => a.status === "DISCONNECTED")).toBe(true);
    expect(removed.shareLinks.every((l) => l.revokedAt)).toBe(true);

    await restoreClient(agencyId, clientId);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).archivedAt).toBeNull();

    await archiveClient(agencyId, clientId);
    await deleteClientPermanently(agencyId, clientId);
    expect(await prisma.client.count({ where: { id: clientId } })).toBe(0);
  });

  it("creates labels, assigns them within the agency only, and deletes them", async () => {
    const c = (await prisma.client.create({ data: { agencyId, name: "Labelled", timezone: "UTC" } })).id;
    const food = await createLabel(agencyId, "  Restaurants ", "good");
    await expect(createLabel(agencyId, "restaurants", "info")).rejects.toThrow(/already exists/);
    await expect(createLabel(agencyId, "  ", "info")).rejects.toThrow(/Enter a label name/);
    const foreign = await createLabel(otherAgencyId, "Foreign", "nope");
    expect((await prisma.clientLabel.findUniqueOrThrow({ where: { id: foreign.id } })).color).toBe("neutral");

    await setClientLabels(agencyId, c, [food.id, foreign.id]);
    const labels = (await prisma.client.findUniqueOrThrow({ where: { id: c }, include: { labels: true } })).labels;
    expect(labels.map((l) => l.name)).toEqual(["Restaurants"]);

    await deleteLabel(otherAgencyId, food.id); // another agency can't delete it
    expect(await prisma.clientLabel.count({ where: { id: food.id } })).toBe(1);
    await deleteLabel(agencyId, food.id);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: c }, include: { labels: true } })).labels).toEqual([]);
  });

  it("adds and removes a label on many clients at once, ignoring other agencies' clients", async () => {
    const a = (await prisma.client.create({ data: { agencyId, name: "Bulk A", timezone: "UTC" } })).id;
    const b = (await prisma.client.create({ data: { agencyId, name: "Bulk B", timezone: "UTC" } })).id;
    const outsider = (await prisma.client.create({ data: { agencyId: otherAgencyId, name: "Outsider", timezone: "UTC" } })).id;
    const vip = await createLabel(agencyId, "VIP", "warning");
    await setClientLabels(agencyId, a, [vip.id]);

    expect(await bulkLabel(agencyId, vip.id, [a, b, b, outsider], "add")).toEqual({ label: "VIP", changed: 1 }); // a already had it
    const has = async (id: string) => (await prisma.client.findUniqueOrThrow({ where: { id }, include: { labels: true } })).labels.some((l) => l.id === vip.id);
    expect([await has(a), await has(b), await has(outsider)]).toEqual([true, true, false]);

    expect(await bulkLabel(agencyId, vip.id, [a, b], "remove")).toEqual({ label: "VIP", changed: 2 });
    expect([await has(a), await has(b)]).toEqual([false, false]);

    await expect(bulkLabel(agencyId, vip.id, [], "add")).rejects.toThrow(/Select at least one client/);
    await expect(bulkLabel(otherAgencyId, vip.id, [a], "add")).rejects.toThrow(/Choose a label/);
  });
});
