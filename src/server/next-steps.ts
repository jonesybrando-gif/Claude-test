import "server-only";
import { prisma } from "./db";
import { dateToIso, todayInTimeZone } from "@/lib/pacing/dates";
import { clientVisibleSteps } from "@/lib/next-steps";
import { formatDate } from "@/lib/time";

export interface NextStepRow {
  id: string;
  text: string;
  status: "DRAFT" | "PLANNED" | "DONE";
  source: string | null;
  sourceText: string | null;
  targetDate: string | null;
  doneOn: string | null;
  approvedAt: Date | null;
}

export async function listNextSteps(clientId: string): Promise<NextStepRow[]> {
  const rows = await prisma.nextStep.findMany({ where: { clientId }, orderBy: [{ createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    status: (r.status === "PLANNED" || r.status === "DONE" ? r.status : "DRAFT") as NextStepRow["status"],
    source: r.source,
    sourceText: r.sourceText,
    targetDate: r.targetDate ? dateToIso(r.targetDate) : null,
    doneOn: r.doneOn ? dateToIso(r.doneOn) : null,
    approvedAt: r.approvedAt,
  }));
}

/**
 * The lines a client reads under "What we're doing next": only steps a person
 * approved (planned) or marked done recently. Never AI drafts.
 */
export async function clientNextStepLines(clientId: string, timezone: string, now: Date = new Date()): Promise<string[]> {
  const steps = clientVisibleSteps(await listNextSteps(clientId), todayInTimeZone(timezone, now));
  const short = (d: string) => formatDate(d, { month: "short", day: "numeric" });
  return [
    ...steps.filter((s) => s.status === "PLANNED").map((s) => `${s.text}${s.targetDate ? ` (update by ${short(s.targetDate)})` : ""}`),
    ...steps.filter((s) => s.status === "DONE").map((s) => `Done ${short(s.doneOn!)}: ${s.text}`),
  ];
}
