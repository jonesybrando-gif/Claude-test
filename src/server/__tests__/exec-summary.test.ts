// Executive summary caching and fallback, with a fake Anthropic API.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { setAiClientForTests } from "../ai/assistant";
import { loadClientReport } from "../client-report";
import { getExecutiveSummary } from "../exec-summary";
import { saveTemplate } from "../report-templates";
import { DEFAULT_TEMPLATE } from "@/lib/report-template";
import { addDays, eachDay, isoToDate, todayInTimeZone } from "@/lib/pacing/dates";

const hasDb = !!process.env.DATABASE_URL;
const prisma = new PrismaClient();
const SLUG = "exec-summary-test";
let clientId = "";
let agencyId = "";
let calls = 0;
let fail = false;

describe.skipIf(!hasDb)("executive summary (database)", () => {
  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY ??= "test-key";
    setAiClientForTests(
      new Anthropic({
        apiKey: "test-key",
        maxRetries: 0,
        fetch: async () => {
          calls++;
          if (fail) return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "down" } }), { status: 500 });
          const msg = { id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ summary: "AI wrote this." }) }] };
          return new Response(JSON.stringify(msg), { status: 200, headers: { "content-type": "application/json" } });
        },
      }),
    );
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    agencyId = (await prisma.agency.create({ data: { name: "Exec", slug: SLUG } })).id;
    clientId = (await prisma.client.create({ data: { agencyId, name: "Exec Client", timezone: "UTC" } })).id;
    const acct = await prisma.adAccount.create({ data: { clientId, platform: "GOOGLE_ADS", externalId: "1", name: "A", currency: "USD", isDemo: true } });
    const today = todayInTimeZone("UTC");
    await prisma.dailyPerformance.createMany({ data: eachDay(addDays(today, -60), addDays(today, -1)).map((d) => ({ accountId: acct.id, date: isoToDate(d), currency: "USD", costMinor: 10000n, impressions: 100n, clicks: 5n, conversions: 1, conversionValueMinor: 0n, isDemo: true })) });
  });
  afterAll(async () => {
    setAiClientForTests(null);
    await prisma.agency.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("writes once per range, then serves the cached text", async () => {
    calls = 0;
    const rep = await loadClientReport(clientId, { range: "last_7", compare: "previous_period" });
    expect(await getExecutiveSummary(rep, { generate: false })).toMatchObject({ source: "auto" });
    expect(calls).toBe(0);
    const [a, b] = await Promise.all([getExecutiveSummary(rep, { generate: true }), getExecutiveSummary(rep, { generate: true })]);
    expect(a).toEqual({ text: "AI wrote this.", source: "ai" });
    expect(b.text).toBe("AI wrote this.");
    expect(calls).toBe(1); // concurrent viewers share one request
    await getExecutiveSummary(rep, { generate: true });
    expect(calls).toBe(1);
    // A different comparison is a different summary.
    await getExecutiveSummary(await loadClientReport(clientId, { range: "last_7", compare: "none" }), { generate: true });
    expect(calls).toBe(2);
    // Older than a day: written again.
    const later = new Date(Date.now() + 25 * 3600_000);
    await getExecutiveSummary(rep, { generate: true, now: later });
    expect(calls).toBe(3);
  });

  it("falls back to the automatic summary when the AI fails or the layout says so", async () => {
    fail = true;
    const rep = await loadClientReport(clientId, { range: "last_30" });
    const s = await getExecutiveSummary(rep, { generate: true });
    expect(s.source).toBe("auto");
    expect(s.text).toContain("Exec Client's ads earned");
    fail = false;
    await saveTemplate(agencyId, clientId, { ...DEFAULT_TEMPLATE, executiveAi: false });
    calls = 0;
    const manual = await getExecutiveSummary(await loadClientReport(clientId, { range: "last_90" }), { generate: true });
    expect(manual.source).toBe("auto");
    expect(calls).toBe(0);
  });
});
