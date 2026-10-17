"use client";

import { useActionState, useState } from "react";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { KPIS, type KpiKey } from "@/lib/kpis";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { MAX_KPIS, MAX_TRENDS, SECTION_KEYS, SECTION_LABEL, type ReportTemplate } from "@/lib/report-template";
import type { TemplateFormState } from "@/server/report-template-actions";

const RANGES = ["mtd", "last_month", "last_7", "last_30", "last_90"] as const;
const COMPARE_LABEL = { previous_period: "Previous period", previous_month: "Same days last month", none: "No comparison" } as const;

const SECTION_HINT: Record<(typeof SECTION_KEYS)[number], string> = {
  summary: "The written summary below, at the top of the report.",
  kpis: "Scorecards for the KPIs you choose.",
  trends: "Daily charts for the trend KPIs, with the comparison period.",
  pacing: "Monthly budget, spend to date and month-end projection.",
  platforms: "One row per connected ad account.",
  campaigns: "Spend and results by campaign.",
  history: "Final spend against budget for the last three months.",
  notes: "How each figure is defined and any data caveats.",
};

function Checks({ name, keys, picked, setPicked, max }: { name: string; keys: KpiKey[]; picked: KpiKey[]; setPicked: (k: KpiKey[]) => void; max: number }) {
  return (
    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {KPIS.filter((k) => keys.includes(k.key)).map((k) => {
        const on = picked.includes(k.key);
        return (
          <label key={k.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={k.key}
              checked={on}
              disabled={!on && picked.length >= max}
              onChange={(e) => setPicked(e.target.checked ? [...picked, k.key] : picked.filter((x) => x !== k.key))}
              className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
            />
            <span>
              <span className="font-medium">{k.label}</span>
              <span className="block text-xs text-text-3">{k.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function TemplateForm({ template, action, submitLabel = "Save report layout" }: { template: ReportTemplate; action: (prev: TemplateFormState, form: FormData) => Promise<TemplateFormState>; submitLabel?: string }) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const form = useFormSubmit(dispatch);
  const [kpis, setKpis] = useState<KpiKey[]>(template.kpis);
  const [trends, setTrends] = useState<KpiKey[]>(template.trendKpis);
  const all = KPIS.map((k) => k.key);
  return (
    <form {...form} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="title">Report title</Label>
          <Input id="title" name="title" defaultValue={template.title} maxLength={120} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultRange">Default date range</Label>
          <Select id="defaultRange" name="defaultRange" defaultValue={template.defaultRange}>
            {RANGES.map((r) => <option key={r} value={r}>{PRESET_LABEL[r]}</option>)}
          </Select>
          <p className="text-xs text-text-3">Used when the page or PDF is opened without choosing a range.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="compare">Compare with</Label>
          <Select id="compare" name="compare" defaultValue={template.compare}>
            {Object.entries(COMPARE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">KPI scorecards <span className="font-normal text-text-3">· {kpis.length} of up to {MAX_KPIS}</span></legend>
        <Checks name="kpis" keys={all} picked={kpis} setPicked={setKpis} max={MAX_KPIS} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Trend charts <span className="font-normal text-text-3">· {trends.length} of up to {MAX_TRENDS}</span></legend>
        <p className="text-xs text-text-3">Each becomes a daily chart in the PDF and is listed first on the client page.</p>
        <Checks name="trendKpis" keys={all} picked={trends} setPicked={setTrends} max={MAX_TRENDS} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Sections</legend>
        <p className="text-xs text-text-3">Unticked sections are left out of the PDF and hidden from client logins. Your team still sees them on the client page.</p>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {SECTION_KEYS.map((k) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={`section:${k}`} defaultChecked={template.sections[k]} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span><span className="font-medium">{SECTION_LABEL[k]}</span><span className="block text-xs text-text-3">{SECTION_HINT[k]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="summary">Written summary</Label>
        <textarea
          id="summary"
          name="summary"
          defaultValue={template.summary}
          rows={5}
          maxLength={5000}
          placeholder="Optional. A note for the client, such as what changed this month and what's next."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        <p className="text-xs text-text-3">Shown as written; it isn&apos;t generated from the data.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
  );
}
