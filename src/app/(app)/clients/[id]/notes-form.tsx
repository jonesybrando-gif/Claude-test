"use client";

import { useActionState } from "react";
import { addChartNoteAction } from "./notes-actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function ChartNoteForm({ clientId, defaultDate, teammates }: { clientId: string; defaultDate: string; teammates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addChartNoteAction.bind(null, clientId), undefined);
  const form = useFormSubmit(action, state?.n);
  return (
    <form {...form} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-date">Date</Label>
          <Input id="note-date" name="date" type="date" defaultValue={defaultDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-text">Note</Label>
          <Input id="note-text" name="text" maxLength={500} required placeholder="e.g. Budget raised to $6,000; new landing page live" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {teammates.length > 0 && (
          <Select name="tag" defaultValue="" className="w-full sm:w-56" aria-label="Tag a teammate">
            <option value="">Don&apos;t tag anyone</option>
            {teammates.map((t) => <option key={t.id} value={t.id}>Tag {t.name}</option>)}
          </Select>
        )}
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" name="clientVisible" className="h-4 w-4 accent-[var(--brand)]" /> Show on the client&apos;s report
        </label>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add note"}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
      </div>
    </form>
  );
}
