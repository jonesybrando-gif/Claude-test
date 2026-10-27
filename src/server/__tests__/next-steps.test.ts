// Only approved or recently done next steps reach the client; drafts never do.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { clientNextStepLines } from "../next-steps";
import { isoToDate } from "@/lib/pacing/dates";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "next-steps-test";
let clientId = "";

describe.skipIf(!hasDb)("client next steps (database)", () => {
  beforeAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    const agency = await prisma.agency.create({ data: { name: "Steps", slug: SLUG } });
    clientId = (await prisma.client.create({ data: { agencyId: agency.id, name: "Steps client", timezone: "UTC" } })).id;
    await prisma.nextStep.createMany({
      data: [
        { clientId, text: "We plan to review the landing page.", status: "DRAFT" },
        { clientId, text: "We'll move unspent budget into search.", status: "PLANNED", targetDate: isoToDate("2026-11-05") },
        { clientId, text: "Added Saturday hours to the ads.", status: "DONE", doneOn: isoToDate("2026-10-20") },
        { clientId, text: "Old finished work.", status: "DONE", doneOn: isoToDate("2026-07-01") },
      ],
    });
  });
  afterAll(async () => {
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("lists planned then recently done steps, never drafts", async () => {
    const lines = await clientNextStepLines(clientId, "UTC", new Date("2026-10-27T12:00:00Z"));
    expect(lines).toEqual(["We'll move unspent budget into search. (update by Nov 5)", "Done Oct 20: Added Saturday hours to the ads."]);
  });
});
