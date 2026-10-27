import "server-only";
import { after } from "next/server";
import { prisma } from "./db";
import type { ClientReport } from "./client-report";
import { aiContextForReport, contextInput } from "./ai/context";
import { AI_MODEL, aiConfigured, draftExecutiveSummary } from "./ai/assistant";
import { autoExecutiveSummary, type ExecutiveSummaryContent } from "@/lib/exec-summary";
import { diffDays } from "@/lib/pacing/dates";

// The executive summary at the top of a report, for whatever date range is
// being viewed. AI-written when the layout asks for it and a key is set,
// cached per range for a day (data can still be restated by the platforms);
// otherwise, or if the AI call fails, built directly from the figures.

const KIND = "exec_summary";
const TTL_MS = 24 * 3600_000;
export type ExecSummary = ExecutiveSummaryContent & { source: "ai" | "auto" };
/** Bumped when the stored shape changes, so older cached summaries are rewritten. */
const VERSION = 3;

const compareKey = (rep: ClientReport) => (rep.cmpRange ? `${rep.cmpRange.from}..${rep.cmpRange.to}` : "none");

export function automaticSummary(rep: ClientReport): ExecSummary {
  return { ...autoExecutiveSummary(contextInput(rep)), source: "auto" };
}

export const wantsAiSummary = (rep: ClientReport) => rep.template.executiveAi && aiConfigured();

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

async function cached(rep: ClientReport, now: Date): Promise<ExecutiveSummaryContent | null> {
  const rows = await prisma.aiInsight.findMany({
    where: { clientId: rep.client.id, kind: KIND, rangeFrom: rep.range.from, rangeTo: rep.range.to, createdAt: { gt: new Date(now.getTime() - TTL_MS) } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const r of rows) {
    const c = r.content as { v?: unknown; compare?: unknown; summary?: Partial<Record<keyof ExecutiveSummaryContent, unknown>> };
    const s = c.summary;
    if (c.v !== VERSION || c.compare !== compareKey(rep) || !s) continue;
    if (typeof s.overview === "string" && strings(s.working) && strings(s.notWorking) && strings(s.recommendations)) {
      return { overview: s.overview, working: s.working, notWorking: s.notWorking, recommendations: s.recommendations, nextSteps: strings(s.nextSteps) ? s.nextSteps : [] };
    }
  }
  return null;
}

// Kept on globalThis: Next bundles pages and API routes separately, and the
// status endpoint must see the same state as the pages that start the work.
const shared = ((globalThis as unknown as { __mnExecSummary?: { inFlight: Map<string, Promise<ExecutiveSummaryContent>>; failedAt: Map<string, number>; queued: Map<string, number> } }).__mnExecSummary ??= {
  inFlight: new Map(),
  failedAt: new Map(),
  queued: new Map(),
});
// Concurrent viewers of the same range share one request.
const inFlight = shared.inFlight;
// After a failed AI call, don't try the same range again for a while (pages would otherwise retry on every view).
const failedAt = shared.failedAt;
const RETRY_AFTER_MS = 10 * 60_000;
const MAX_BACKGROUND = 3;
// Asked for by a page, starting once that page has been sent.
const queued = shared.queued;
const isQueued = (key: string) => {
  const t = queued.get(key);
  return t !== undefined && Date.now() - t < 2 * 60_000;
};

/** Identifies one summary: client, range and comparison. */
export const summaryKey = (rep: ClientReport) => `${rep.client.id}|${rep.range.from}|${rep.range.to}|${compareKey(rep)}`;

function startGeneration(rep: ClientReport, key: string): Promise<ExecutiveSummaryContent> {
  let p = inFlight.get(key);
  if (!p) {
    p = (async () => {
      const agency = await prisma.agency.findUniqueOrThrow({ where: { id: rep.client.agencyId }, select: { name: true } });
      const summary = await draftExecutiveSummary(await aiContextForReport(rep), { agencyName: agency.name, days: diffDays(rep.range.from, rep.range.to) + 1 });
      await prisma.aiInsight.create({ data: { clientId: rep.client.id, kind: KIND, content: { v: VERSION, summary: { ...summary }, compare: compareKey(rep) }, model: AI_MODEL, rangeFrom: rep.range.from, rangeTo: rep.range.to } });
      failedAt.delete(key);
      return summary;
    })()
      .catch((e) => {
        failedAt.set(key, Date.now());
        throw e;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}

/** True while an AI summary for this key is being written. */
export const summaryPending = (key: string) => isQueued(key) || inFlight.has(key);

/**
 * The summary to show.
 *  - `generate: false`: never calls the AI (falls back to automatic).
 *  - `generate: true`: waits for the AI (PDFs and emails, which must contain it).
 *  - `generate: "background"`: for pages. Returns the saved AI summary, or the
 *    automatic one at once with `pending: true` while the AI version is written
 *    in the background, so a page never waits on the AI.
 */
export async function getExecutiveSummary(rep: ClientReport, opts: { generate: boolean | "background"; now?: Date }): Promise<ExecSummary & { pending?: boolean }> {
  if (!wantsAiSummary(rep)) return automaticSummary(rep);
  const now = opts.now ?? new Date();
  const key = summaryKey(rep);
  try {
    const hit = await cached(rep, now);
    if (hit) return { ...hit, source: "ai" };
    if (!opts.generate) return automaticSummary(rep);
    if (opts.generate === "background") {
      const failed = failedAt.get(key);
      if (failed && Date.now() - failed < RETRY_AFTER_MS) return automaticSummary(rep);
      // Start once the page has been sent, so the AI's database work never slows the page itself.
      const run = () => {
        queued.delete(key);
        return startGeneration(rep, key).catch((e) => console.error("Executive summary: AI unavailable, using the automatic version", e));
      };
      // At most a few written at once, so skimming many clients can't set off a burst of AI calls.
      const busy = inFlight.size + [...queued.keys()].filter(isQueued).length;
      if (!inFlight.has(key) && !isQueued(key) && busy >= MAX_BACKGROUND) return automaticSummary(rep);
      if (!inFlight.has(key) && !isQueued(key)) {
        queued.set(key, Date.now());
        try {
          after(run);
        } catch {
          void run(); // Outside a request (no after()): start now.
        }
      }
      return { ...automaticSummary(rep), pending: true };
    }
    return { ...(await startGeneration(rep, key)), source: "ai" };
  } catch (e) {
    console.error("Executive summary: AI unavailable, using the automatic version", e);
    return automaticSummary(rep);
  }
}
