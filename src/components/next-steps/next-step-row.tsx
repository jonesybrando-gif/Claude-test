"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { deleteNextStepAction, markStepDoneAction, saveNextStepAction, type StepState } from "@/app/(app)/clients/[id]/next-steps-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/time";

export interface StepView {
  id: string;
  text: string;
  status: "DRAFT" | "PLANNED" | "DONE";
  source: string | null;
  sourceText: string | null;
  targetDate: string | null;
  doneOn: string | null;
}

const PILL = {
  DRAFT: { label: "Draft · hidden", cls: "bg-ai-bg text-ai" },
  PLANNED: { label: "Planned · client sees", cls: "bg-info-bg text-info-ink" },
  DONE: { label: "Done", cls: "bg-good-bg text-good-ink" },
} as const;

/** One next step: edit its wording and date, approve it for the client, mark it done, or remove it. */
export function NextStepRow({ clientId, step, today, canEdit }: { clientId: string; step: StepView; today: string; canEdit: boolean }) {
  const [state, save, saving] = useActionState<StepState, FormData>(saveNextStepAction.bind(null, clientId, step.id), undefined);
  const [doneState, markDone, marking] = useActionState<StepState, FormData>(markStepDoneAction.bind(null, clientId, step.id), undefined);
  const [, startTransition] = useTransition();
  const [showDone, setShowDone] = useState(false);
  const pill = PILL[step.status];
  const submit = (intent: "save" | "approve") => (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    fd.set("intent", intent);
    startTransition(() => save(fd));
  };
  const message = state?.error ?? doneState?.error;
  const ok = state?.ok ?? doneState?.ok;

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${pill.cls}`}>
          {step.status === "DONE" && step.doneOn ? `Done ${formatDate(step.doneOn, { month: "short", day: "numeric" })}` : pill.label}
        </span>
        {step.source === "recommendation" && <span className="text-xs text-text-3">From an AI recommendation</span>}
        {step.source === "ai_summary" && <span className="text-xs text-text-3">Drafted by AI</span>}
      </div>
      {step.status === "DONE" || !canEdit ? (
        <p className="text-sm leading-relaxed">{step.text}</p>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={(e) => e.preventDefault()}>
          {step.sourceText && step.source === "recommendation" && <p className="text-xs text-text-3">Recommendation: {step.sourceText}</p>}
          <label className="sr-only" htmlFor={`step-${step.id}`}>What the client will read</label>
          <textarea id={`step-${step.id}`} name="text" defaultValue={step.text} rows={2} maxLength={400} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-text-2">
              Update by <Input name="target" type="date" defaultValue={step.targetDate ?? ""} className="h-9 w-40" />
            </label>
            <span className="text-xs text-text-3">optional</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {step.status === "DRAFT" && <Button type="submit" size="sm" disabled={saving} onClick={submit("approve")}>Approve for client</Button>}
            <Button type="submit" size="sm" variant="outline" disabled={saving} onClick={submit("save")}>Save</Button>
            {step.status === "PLANNED" && <Button type="button" size="sm" variant="outline" onClick={() => setShowDone((v) => !v)}>Mark done…</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => startTransition(() => deleteNextStepAction(clientId, step.id))}>Remove</Button>
          </div>
        </form>
      )}
      {showDone && step.status === "PLANNED" && (
        <form
          className="flex flex-col gap-2 rounded-lg bg-surface-2 px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => markDone(fd));
          }}
        >
          <label htmlFor={`done-${step.id}`} className="text-sm font-medium">What was done?</label>
          <textarea id={`done-${step.id}`} name="doneText" rows={2} maxLength={400} placeholder="e.g. Moved $300 from Display into search." className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">Date <Input name="doneOn" type="date" defaultValue={today} max={today} className="h-9 w-40" /></label>
            <Button type="submit" size="sm" disabled={marking}>Confirm done</Button>
          </div>
          <span className="text-xs text-text-3">The client sees this wording as done on this date. Leave it blank to keep the current wording if it already describes finished work.</span>
        </form>
      )}
      {message && <p role="alert" className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-ink">{message}</p>}
      {ok && !message && <p role="status" className="text-xs text-good-ink">{ok}</p>}
    </li>
  );
}

/** Adds a step written by a person (starts as a draft). */
export function NewStepForm({ clientId }: { clientId: string }) {
  const [state, save, saving] = useActionState<StepState, FormData>(saveNextStepAction.bind(null, clientId, null), undefined);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  // Clear the box only once the step is saved, so a rejected draft isn't lost.
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form
      ref={ref}
      className="flex flex-col gap-2 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => save(fd));
      }}
    >
      <label htmlFor="new-step" className="text-sm font-medium">Write a next step</label>
      <textarea id="new-step" name="text" rows={2} maxLength={400} required placeholder="e.g. We'll test a new landing page for implant enquiries." className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60" />
      <div><Button type="submit" size="sm" variant="outline" disabled={saving}>Add as draft</Button></div>
      {state?.error && <p role="alert" className="text-sm text-warning-ink">{state.error}</p>}
    </form>
  );
}
