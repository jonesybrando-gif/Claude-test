import type { ClientReport } from "@/server/client-report";
import { listNextSteps } from "@/server/next-steps";
import { getExecutiveSummary } from "@/server/exec-summary";
import { NewStepForm, NextStepRow } from "./next-step-row";
import { AddDraftsButton } from "./add-drafts-button";

/**
 * Reports tab: the next steps the client reads under "What we're doing next".
 * AI and recommendations only create drafts; a person approves each one
 * (Planned) and later marks it done with a date.
 */
export async function NextStepsSection({ rep, canEdit }: { rep: ClientReport; canEdit: boolean }) {
  const [steps, summary] = await Promise.all([listNextSteps(rep.client.id), getExecutiveSummary(rep, { generate: false })]);
  const known = new Set(steps.flatMap((s) => [s.text, s.sourceText]));
  const aiDrafts = (summary.source === "ai" ? summary.nextSteps ?? [] : []).filter((t) => !known.has(t));
  const order = { DRAFT: 0, PLANNED: 1, DONE: 2 } as const;
  const sorted = [...steps].sort((a, b) => order[a.status] - order[b.status] || (b.doneOn ?? "").localeCompare(a.doneOn ?? ""));
  const visible = steps.filter((s) => s.status !== "DRAFT").length;

  return (
    <section aria-labelledby="next-steps" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-3">
        <h2 id="next-steps" className="text-[15px] font-semibold">Next steps for the client</h2>
        <p className="max-w-[75ch] text-sm text-text-2">
          What the client reads under “What we&apos;re doing next” in their report, PDF and emails. Drafts stay hidden until you approve them. Only you mark a step done.
          {" "}{visible === 0 ? "Nothing is shown to the client yet." : `${visible} shown to the client.`}
        </p>
      </div>
      {canEdit && aiDrafts.length > 0 && (
        <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ai-bg px-4 py-3">
          <p className="text-sm text-text"><span className="font-medium text-ai">AI suggested {aiDrafts.length} next step{aiDrafts.length === 1 ? "" : "s"}</span> in this period&apos;s summary. Add them as drafts to edit and approve.</p>
          <AddDraftsButton clientId={rep.client.id} texts={aiDrafts} />
        </div>
      )}
      {sorted.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {sorted.map((s) => <NextStepRow key={s.id} clientId={rep.client.id} step={s} today={rep.today} canEdit={canEdit} />)}
        </ul>
      )}
      {canEdit && <div className="border-t border-border"><NewStepForm clientId={rep.client.id} /></div>}
    </section>
  );
}
