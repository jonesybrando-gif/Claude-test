"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Sparkles, X } from "lucide-react";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { KPI_BY_KEY, KPIS, type KpiKey } from "@/lib/kpis";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { MAX_KPIS, MAX_TRENDS, SECTION_KEYS, SECTION_LABEL, templateFromForm, type ReportTemplate } from "@/lib/report-template";
import type { TemplateFormState } from "@/server/report-template-actions";

const RANGES = ["mtd", "last_month", "last_7", "last_30", "last_90"] as const;
const COMPARE_LABEL = { previous_period: "Previous period", previous_month: "Same days last month", none: "No comparison" } as const;

const SECTION_HINT: Record<(typeof SECTION_KEYS)[number], string> = {
  executive: "A paragraph or two at the top about the selected date range, rewritten whenever the range changes.",
  summary: "Your own note below, shown as written.",
  kpis: "The KPI tiles you choose, folded under “Advertising detail”. At a glance always opens the report.",
  trends: "Daily charts for the trend KPIs, with the comparison period.",
  pacing: "Monthly budget, spend to date and month-end projection.",
  platforms: "One row per connected ad account.",
  campaigns: "Spend and results by campaign.",
  history: "Final spend against budget for the last three months.",
  notes: "How each figure is defined and any data caveats.",
};

/** The chosen KPIs in display order: drag, or use the arrows, to rearrange. */
function KpiArranger({ picked, setPicked, max }: { picked: KpiKey[]; setPicked: (k: KpiKey[]) => void; max: number }) {
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= picked.length || from === to) return;
    const next = [...picked];
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    setPicked(next);
  };
  const available = KPIS.filter((k) => !picked.includes(k.key));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ol className="flex flex-col gap-1.5" aria-label="KPIs in the report, in order">
        {picked.map((k, i) => (
          <li
            key={k}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragging !== null) move(dragging, i); setDragging(null); }}
            onDragEnd={() => setDragging(null)}
            className={`flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm ${dragging === i ? "opacity-50" : ""}`}
            data-kpi={k}
          >
            <input type="hidden" name="kpis" value={k} />
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-text-3" aria-hidden />
            <span className="w-5 shrink-0 text-xs text-text-3 tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{KPI_BY_KEY[k].label}</span>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${KPI_BY_KEY[k].label} up`} className="rounded p-1 text-text-2 hover:bg-surface-2 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === picked.length - 1} aria-label={`Move ${KPI_BY_KEY[k].label} down`} className="rounded p-1 text-text-2 hover:bg-surface-2 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setPicked(picked.filter((x) => x !== k))} disabled={picked.length === 1} aria-label={`Remove ${KPI_BY_KEY[k].label}`} className="rounded p-1 text-text-2 hover:bg-surface-2 hover:text-critical-ink disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-3">{available.length === 0 ? "Every KPI is in the report." : picked.length >= max ? `The report has the maximum of ${max} KPIs. Remove one to add another.` : "Add a KPI:"}</p>
        <div className="flex flex-wrap gap-1.5">
          {available.map((k) => (
            <button key={k.key} type="button" onClick={() => setPicked([...picked, k.key])} disabled={picked.length >= max} title={k.description} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-40">
              <Plus className="h-3 w-3" aria-hidden /> {k.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

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

export interface PreviewSample {
  clientName: string;
  currency: string;
  /** Formatted KPI values for the client's default range. */
  values: Partial<Record<KpiKey, string>>;
}

const Bar = ({ w = "w-full" }: { w?: string }) => <div className={`h-1.5 rounded bg-border ${w}`} aria-hidden />;

/** A miniature of the client-facing report that follows the form as it changes. */
function LayoutPreview({ t, sample }: { t: ReportTemplate; sample?: PreviewSample }) {
  const on = t.sections;
  const block = (title: string, body: React.ReactNode) => (
    <div className="rounded-md border border-border bg-surface p-2">
      <p className="mb-1.5 text-[10px] font-semibold text-text">{title}</p>
      {body}
    </div>
  );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-text" aria-label="Live preview of the client report">
      <div>
        <p className="text-xs font-semibold">{sample?.clientName ?? "Client name"}</p>
        <p className="text-[10px] text-text-3">{t.title} · {PRESET_LABEL[t.defaultRange]}{t.compare !== "none" ? ` vs ${COMPARE_LABEL[t.compare].toLowerCase()}` : ""}</p>
      </div>
      {on.kpis && (
        <div className="grid grid-cols-3 gap-1">
          {t.kpis.map((k) => (
            <div key={k} className="rounded border border-border bg-surface px-1.5 py-1">
              <p className="truncate text-[8px] text-text-3">{KPI_BY_KEY[k].label}</p>
              <p className="truncate text-[11px] font-semibold tabular">{sample?.values[k] ?? "—"}</p>
            </div>
          ))}
        </div>
      )}
      {on.trends && t.trendKpis.length > 0 && block(`Trend · ${t.trendKpis.map((k) => KPI_BY_KEY[k].short).join(", ")}`, (
        <svg viewBox="0 0 100 24" className="h-6 w-full" aria-hidden><polyline points="0,18 15,14 30,16 45,9 60,11 75,6 100,8" fill="none" stroke="var(--series-actual)" strokeWidth="1.5" /></svg>
      ))}
      {on.executive && block(t.executiveAi ? "Summary (AI-written)" : "Summary (automatic)", <div className="flex flex-col gap-1"><Bar /><Bar w="w-5/6" /><Bar w="w-2/3" /></div>)}
      {on.summary && t.summary.trim() && block("Note", <p className="line-clamp-3 text-[9px] text-text-2">{t.summary.trim()}</p>)}
      {on.pacing && block("Budget pacing", <div className="flex flex-col gap-1"><Bar /><Bar w="w-3/4" /></div>)}
      {on.platforms && block("Platform breakdown", <div className="flex flex-col gap-1"><Bar /><Bar /></div>)}
      {on.campaigns && block("Campaigns", <div className="flex flex-col gap-1"><Bar /><Bar /><Bar w="w-4/5" /></div>)}
      {on.history && block("Budget history", <Bar w="w-2/3" />)}
      {on.notes && <p className="text-[9px] text-text-3">Notes and definitions (PDF)</p>}
      {!SECTION_KEYS.some((k) => on[k]) && <p className="text-xs text-text-3">Every section is turned off.</p>}
    </div>
  );
}

export function TemplateForm({
  template,
  action,
  submitLabel = "Save report layout",
  draftSummary,
  sample,
}: {
  template: ReportTemplate;
  action: (prev: TemplateFormState, form: FormData) => Promise<TemplateFormState>;
  submitLabel?: string;
  /** When set, offers an AI-drafted summary from the client's data. */
  draftSummary?: () => Promise<{ summary?: string; error?: string }>;
  /** Real figures for the live preview (client layouts). */
  sample?: PreviewSample;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const form = useFormSubmit(dispatch);
  const [kpis, setKpis] = useState<KpiKey[]>(template.kpis);
  const [trends, setTrends] = useState<KpiKey[]>(template.trendKpis);
  // The preview re-reads the whole form whenever anything in it changes.
  const [preview, setPreview] = useState<ReportTemplate>(template);
  const [edits, setEdits] = useState(0);
  useEffect(() => {
    if (form.ref.current) setPreview(templateFromForm(new FormData(form.ref.current)).template);
  }, [kpis, trends, edits, form.ref]);
  const all = KPIS.map((k) => k.key);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const [drafting, startDraft] = useTransition();
  const [draftNote, setDraftNote] = useState<{ ok?: boolean; text: string } | null>(null);
  const onDraft = () =>
    startDraft(async () => {
      setDraftNote(null);
      const r = await draftSummary!();
      if (r.summary && summaryRef.current) {
        summaryRef.current.value = r.summary;
        setDraftNote({ ok: true, text: "AI draft inserted. Check the figures, edit as needed, then save." });
      } else setDraftNote({ text: r.error ?? "No draft was returned." });
    });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <form {...form} onInput={() => setEdits((n) => n + 1)} onChange={() => setEdits((n) => n + 1)} className="flex flex-col gap-6">
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
        <p className="text-xs text-text-3">Shown in this order on the report page, shared links and the PDF. Drag or use the arrows to rearrange.</p>
        <KpiArranger picked={kpis} setPicked={setKpis} max={MAX_KPIS} />
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Executive summary</legend>
        <p className="text-xs text-text-3">Written fresh for whichever date range is being viewed, using only the report&apos;s figures.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="executiveAi" value="ai" defaultChecked={template.executiveAi} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
          <span><span className="font-medium">Written by AI</span><span className="block text-xs text-text-3">Reads naturally. Needs ANTHROPIC_API_KEY; until then the automatic version is used. Each new date range is one short AI request, saved for a day.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="executiveAi" value="auto" defaultChecked={!template.executiveAi} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
          <span><span className="font-medium">Automatic from the figures</span><span className="block text-xs text-text-3">Plain sentences built directly from the numbers. No AI.</span></span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="summary">Written note</Label>
          {draftSummary && (
            <Button type="button" variant="outline" size="sm" onClick={onDraft} disabled={drafting}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> {drafting ? "Drafting…" : "Draft with AI"}
            </Button>
          )}
        </div>
        <textarea
          ref={summaryRef}
          id="summary"
          name="summary"
          defaultValue={template.summary}
          rows={5}
          maxLength={5000}
          placeholder="Optional. A note for the client, such as what changed this month and what's next."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        {draftNote && <p className={`text-xs ${draftNote.ok ? "text-good-ink" : "text-critical-ink"}`} role={draftNote.ok ? "status" : "alert"}>{draftNote.text}</p>}
        <p className="text-xs text-text-3">Shown exactly as saved. {draftSummary ? "An AI draft uses this client's figures for the default date range; it isn't updated automatically afterwards." : "It isn't generated from the data."}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
    <aside className="order-first lg:order-none">
      <div className="flex flex-col gap-2 lg:sticky lg:top-4">
        <p className="text-xs font-medium text-text-3">Live preview{sample ? " · this client's figures" : ""}</p>
        <LayoutPreview t={preview} sample={sample} />
        <p className="text-[11px] text-text-3">Updates as you edit; save to apply it to the report, shared links and PDF.</p>
      </div>
    </aside>
    </div>
  );
}
