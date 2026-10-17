import "server-only";
import { prisma } from "./db";
import type { ClientReport } from "./client-report";
import { contextForReport, contextInput } from "./ai/context";
import { AI_MODEL, aiConfigured, draftExecutiveSummary } from "./ai/assistant";
import { autoExecutiveSummary } from "@/lib/exec-summary";
import { diffDays } from "@/lib/pacing/dates";

// The executive summary at the top of a report, for whatever date range is
// being viewed. AI-written when the layout asks for it and a key is set,
// cached per range for a day (data can still be restated by the platforms);
// otherwise, or if the AI call fails, built directly from the figures.

const KIND = "exec_summary";
const TTL_MS = 24 * 3600_000;
export type ExecSummary = { text: string; source: "ai" | "auto" };

const compareKey = (rep: ClientReport) => (rep.cmpRange ? `${rep.cmpRange.from}..${rep.cmpRange.to}` : "none");

export function automaticSummary(rep: ClientReport): ExecSummary {
  return { text: autoExecutiveSummary(contextInput(rep)), source: "auto" };
}

export const wantsAiSummary = (rep: ClientReport) => rep.template.executiveAi && aiConfigured();

async function cached(rep: ClientReport, now: Date): Promise<string | null> {
  const rows = await prisma.aiInsight.findMany({
    where: { clientId: rep.client.id, kind: KIND, rangeFrom: rep.range.from, rangeTo: rep.range.to, createdAt: { gt: new Date(now.getTime() - TTL_MS) } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const r of rows) {
    const c = r.content as { text?: unknown; compare?: unknown };
    if (c.compare === compareKey(rep) && typeof c.text === "string") return c.text;
  }
  return null;
}

// Concurrent viewers of the same range share one request.
const inFlight = new Map<string, Promise<string>>();

/** The summary to show. With `generate: false` it never calls the AI (falls back to automatic). */
export async function getExecutiveSummary(rep: ClientReport, opts: { generate: boolean; now?: Date }): Promise<ExecSummary> {
  if (!wantsAiSummary(rep)) return automaticSummary(rep);
  const now = opts.now ?? new Date();
  try {
    const hit = await cached(rep, now);
    if (hit) return { text: hit, source: "ai" };
    if (!opts.generate) return automaticSummary(rep);
    const key = `${rep.client.id}|${rep.range.from}|${rep.range.to}|${compareKey(rep)}`;
    let p = inFlight.get(key);
    if (!p) {
      p = (async () => {
        const agency = await prisma.agency.findUniqueOrThrow({ where: { id: rep.client.agencyId }, select: { name: true } });
        const text = await draftExecutiveSummary(contextForReport(rep), { agencyName: agency.name, days: diffDays(rep.range.from, rep.range.to) + 1 });
        await prisma.aiInsight.create({ data: { clientId: rep.client.id, kind: KIND, content: { text, compare: compareKey(rep) }, model: AI_MODEL, rangeFrom: rep.range.from, rangeTo: rep.range.to } });
        return text;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, p);
    }
    return { text: await p, source: "ai" };
  } catch (e) {
    console.error("Executive summary: AI unavailable, using the automatic version", e);
    return automaticSummary(rep);
  }
}
