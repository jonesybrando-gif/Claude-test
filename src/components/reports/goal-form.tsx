"use client";

import { useActionState } from "react";
import type { ClientGoal } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { GOAL_OPTIONS } from "@/lib/results";
import type { GoalFormState } from "@/server/report-template-actions";

/** "What does this client want from advertising?": decides what the report counts as Results. */
export function GoalForm({ goal, guess, action }: { goal: ClientGoal | null; guess: string; action: (prev: GoalFormState, form: FormData) => Promise<GoalFormState> }) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const options = [...GOAL_OPTIONS.map((o) => ({ value: o.value as string, label: o.label, hint: o.hint })), { value: "", label: "Let Marketing Nexus decide", hint: `Chosen from the data. Right now: ${guess}.` }];
  return (
    <form action={dispatch} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">What does this client want from advertising?</legend>
        {options.map((o) => (
          <label key={o.value || "auto"} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-surface-2">
            <input type="radio" name="goal" value={o.value} defaultChecked={(goal ?? "") === o.value} className="mt-1 accent-[var(--brand)]" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{o.label}</span>
              <span className="text-xs text-text-3">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save goal"}</Button>
        <p className="text-sm" role="status" aria-live="polite">
          {state?.ok && <span className="text-good-ink">{state.ok}</span>}
          {state?.error && <span className="text-critical-ink">{state.error}</span>}
        </p>
      </div>
    </form>
  );
}
