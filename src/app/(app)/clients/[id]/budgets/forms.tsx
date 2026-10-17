"use client";

import { useActionState, useState } from "react";
import { createBudget, deleteBudget, reviseBudget, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useFormSubmit } from "@/components/use-form-submit";

function Messages({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <div role="status" className="text-sm">
      {state.ok && <p className="text-good-ink">{state.ok}</p>}
      {state.errors?.map((e) => <p key={e} className="text-critical-ink">{e}</p>)}
    </div>
  );
}

interface Target { id: string; label: string }

export function NewBudgetForm({ clientId, accounts, campaigns, defaultStart, defaultEnd }: { clientId: string; accounts: Target[]; campaigns: Target[]; defaultStart: string; defaultEnd: string }) {
  const [state, action, pending] = useActionState(createBudget.bind(null, clientId), undefined);
  const form = useFormSubmit(action, state?.ok && state);
  const [scope, setScope] = useState<"CLIENT" | "ACCOUNT" | "CAMPAIGN">("ACCOUNT");
  const [distribution, setDistribution] = useState("EVEN");
  const targets = scope === "ACCOUNT" ? accounts : scope === "CAMPAIGN" ? campaigns : [];
  return (
    <form {...form} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="scope">Budget level</Label>
        <Select id="scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="ACCOUNT">Advertising account</option>
          <option value="CLIENT">Combined client (all platforms)</option>
          <option value="CAMPAIGN">Individual campaign</option>
        </Select>
      </div>
      {scope !== "CLIENT" && (
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="target">{scope === "ACCOUNT" ? "Account" : "Campaign"}</Label>
          <Select id="target" name="target" required>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Budget amount (USD)</Label>
        <Input id="amount" name="amount" inputMode="decimal" placeholder="5000" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="periodStart">Period start</Label>
        <Input id="periodStart" name="periodStart" type="date" defaultValue={defaultStart} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="periodEnd">Period end</Label>
        <Input id="periodEnd" name="periodEnd" type="date" defaultValue={defaultEnd} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="distribution">Daily distribution</Label>
        <Select id="distribution" name="distribution" value={distribution} onChange={(e) => setDistribution(e.target.value)}>
          <option value="EVEN">Even across every day</option>
          <option value="BUSINESS_DAYS">Business days only (Mon–Fri)</option>
          <option value="WEEKEND_WEIGHTED">Weekend-weighted</option>
        </Select>
      </div>
      {distribution === "WEEKEND_WEIGHTED" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weekendWeight">Weekend day weight (weekday = 1)</Label>
          <Input id="weekendWeight" name="weekendWeight" defaultValue="1.5" inputMode="decimal" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forecastModel">Forecast model</Label>
        <Select id="forecastModel" name="forecastModel" defaultValue="STRAIGHT_LINE">
          <option value="STRAIGHT_LINE">Straight-line (month to date)</option>
          <option value="TRAILING_7_DAY">Recent trend (last 7 days)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pauseStart">Planned pause from (optional)</Label>
        <Input id="pauseStart" name="pauseStart" type="date" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pauseEnd">Planned pause to</Label>
        <Input id="pauseEnd" name="pauseEnd" type="date" />
      </div>
      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add budget"}</Button>
        <Messages state={state} />
      </div>
    </form>
  );
}

export function ReviseBudgetForm({ clientId, budgetId, defaultDate, min, max }: { clientId: string; budgetId: string; defaultDate: string; min: string; max: string }) {
  const [state, action, pending] = useActionState(reviseBudget.bind(null, clientId), undefined);
  const form = useFormSubmit(action, state?.ok && state);
  return (
    <form {...form} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="budgetId" value={budgetId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`amt-${budgetId}`}>New total budget</Label>
        <Input id={`amt-${budgetId}`} name="amount" inputMode="decimal" className="w-32" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`eff-${budgetId}`}>Effective from</Label>
        <Input id={`eff-${budgetId}`} name="effectiveDate" type="date" defaultValue={defaultDate} min={min} max={max} className="w-40" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`note-${budgetId}`}>Note</Label>
        <Input id={`note-${budgetId}`} name="note" placeholder="e.g. client approved increase" className="w-56" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Revise"}</Button>
      <Messages state={state} />
    </form>
  );
}

export function DeleteBudgetButton({ clientId, budgetId }: { clientId: string; budgetId: string }) {
  return (
    <form
      action={deleteBudget.bind(null, clientId)}
      onSubmit={(e) => {
        if (!confirm("Delete this budget and its revision history? This cannot be undone.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="budgetId" value={budgetId} />
      <Button type="submit" variant="ghost" size="sm" className="text-critical-ink">Delete</Button>
    </form>
  );
}
