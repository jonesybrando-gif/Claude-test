"use client";

import { useActionState, useState } from "react";
import { createBudget, deleteBudget, reviseBudget, setBudgetRepeats, type FormState } from "./actions";
import { isWholeMonth } from "@/lib/budget-rollover";
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
  const [period, setPeriod] = useState({ start: defaultStart, end: defaultEnd });
  const wholeMonth = /^\d{4}-\d{2}-\d{2}$/.test(period.start) && /^\d{4}-\d{2}-\d{2}$/.test(period.end) && isWholeMonth(period.start, period.end);
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
        <Input id="periodStart" name="periodStart" type="date" defaultValue={defaultStart} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="periodEnd">Period end</Label>
        <Input id="periodEnd" name="periodEnd" type="date" defaultValue={defaultEnd} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} required />
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
      <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="repeatsMonthly" defaultChecked disabled={!wholeMonth} className="h-4 w-4 accent-[var(--brand)]" />
          Repeats every month
        </label>
        <p className="text-xs text-text-2">
          {wholeMonth
            ? "On the 1st of each month we create next month's budget with the same amount and settings. You can change or stop it any time."
            : "Only budgets that cover a whole calendar month (the 1st to the last day) can repeat. This one will end on its end date."}
        </p>
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

/** "Repeats monthly" on a budget card, with a one-click toggle. */
export function RepeatToggle({ clientId, budgetId, repeats, wholeMonth }: { clientId: string; budgetId: string; repeats: boolean; wholeMonth: boolean }) {
  if (!wholeMonth) return <span className="text-xs text-text-2">One-off period (does not repeat)</span>;
  return (
    <form action={setBudgetRepeats.bind(null, clientId)} className="flex flex-wrap items-center gap-2 text-xs">
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="repeats" value={repeats ? "0" : "1"} />
      <span className={repeats ? "font-medium text-text" : "text-text-2"}>{repeats ? "Repeats monthly" : "Does not repeat"}</span>
      <Button type="submit" variant="ghost" size="sm">{repeats ? "Stop repeating" : "Repeat every month"}</Button>
    </form>
  );
}
