"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Plus, X } from "lucide-react";
import { KpiCard, kpiNote } from "@/components/kpi/kpi-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { KPI_BY_KEY, KPIS, type KpiKey, type KpiValue } from "@/lib/kpis";
import { MAX_KPIS } from "@/lib/report-template";
import { saveClientKpisAction } from "@/server/report-template-actions";

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6";

export interface KpiEditorProps {
  clientId: string;
  /** The saved KPI order. */
  kpis: KpiKey[];
  /** Values for every catalogue KPI, so tiles added while editing show figures straight away. */
  values: Record<KpiKey, KpiValue>;
  trends: Record<KpiKey, (number | null)[]>;
  currency: string;
  marker?: ReactNode;
  /** KPIs the client doesn't track: left out of the normal view, still offered (and shown) while editing. */
  hidden?: KpiKey[];
  /** Small labels on a tile's value, e.g. { spend: "Estimated" }. */
  chips?: Partial<Record<KpiKey, string>>;
}

/** The Overview's KPI tiles, with an inline editor for staff: reorder, remove, add, then save. */
export function KpiEditor({ clientId, kpis, values, trends, currency, marker, hidden = [], chips = {} }: KpiEditorProps) {
  const [editing, setEditing] = useState(false);
  // What is shown outside edit mode: the saved order, updated as soon as a save succeeds.
  const [committed, setCommitted] = useState(kpis);
  const [draft, setDraft] = useState(kpis);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusEdit = () => requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[data-edit-kpis]")?.focus());

  // A fresh server render (another tab saved, the range changed) replaces the saved order.
  const savedKey = kpis.join(",");
  useEffect(() => {
    setCommitted(kpis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const begin = () => { setDraft(committed); setError(null); setEditing(true); };
  const cancel = () => { setEditing(false); setError(null); focusEdit(); };
  const dirty = draft.join(",") !== committed.join(",");
  const save = () =>
    start(async () => {
      setError(null);
      try {
        const res = await saveClientKpisAction(clientId, draft);
        if (!res.ok) return setError(res.error);
        setCommitted(draft);
        setEditing(false);
        focusEdit();
      } catch {
        setError("The KPIs couldn't be saved. Check your connection and try again.");
      }
    });

  const tile = (k: KpiKey) => <KpiCard kv={values[k]} currency={currency} trend={trends[k]} note={kpiNote(values[k])} chip={chips[k]} />;
  const shown = committed.filter((k) => !hidden.includes(k));
  const hiddenCount = committed.length - shown.length;

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div>{marker}</div>
        {!editing && (
          <Button data-edit-kpis type="button" variant="ghost" size="sm" onClick={begin}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit KPIs
          </Button>
        )}
      </div>
      {editing ? (
        <EditGrid draft={draft} setDraft={setDraft} tile={tile} disabled={pending}>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>Cancel</Button>
            <span className="text-xs text-text-3">Saving updates this page, shared links and the PDF.</span>
          </div>
          {error && <p className="text-sm text-critical-ink" role="alert">{error}</p>}
        </EditGrid>
      ) : (
        <>
          <div className={GRID}>{shown.map((k) => <div key={k}>{tile(k)}</div>)}</div>
          {hiddenCount > 0 && (
            <p className="text-xs text-text-3">
              {hiddenCount} tile{hiddenCount === 1 ? " is" : "s are"} hidden because this client doesn&apos;t track {hiddenCount === 1 ? "it" : "them"} (no leads or no real sales values). Edit KPIs shows every tile.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The tiles in edit mode: drag (mouse or touch) or use the arrows to reorder; × removes; add below. */
function EditGrid({ draft, setDraft, tile, disabled, children }: { draft: KpiKey[]; setDraft: (k: KpiKey[]) => void; tile: (k: KpiKey) => ReactNode; disabled: boolean; children: ReactNode }) {
  const [dragging, setDragging] = useState<KpiKey | null>(null);
  const [over, setOver] = useState<KpiKey | null>(null);
  const [announce, setAnnounce] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const gridRef = useRef<HTMLOListElement>(null);

  // Keep keyboard focus on the control that was used, wherever its tile moved to.
  useEffect(() => {
    if (!focus) return;
    const el = gridRef.current?.parentElement?.querySelector<HTMLElement>(focus);
    if (el && !(el as HTMLButtonElement).disabled) el.focus();
    else gridRef.current?.parentElement?.querySelector<HTMLElement>("[data-add-kpi]")?.focus();
    setFocus(null);
  }, [focus, draft]);

  const moveTo = (k: KpiKey, to: number) => {
    const from = draft.indexOf(k);
    if (from < 0 || to < 0 || to >= draft.length || from === to) return;
    const next = [...draft];
    next.splice(from, 1);
    next.splice(to, 0, k);
    setDraft(next);
    setAnnounce(`${KPI_BY_KEY[k].label} moved to position ${to + 1} of ${next.length}.`);
  };
  const remove = (k: KpiKey) => {
    if (draft.length <= 1) return;
    const i = draft.indexOf(k);
    const next = draft.filter((x) => x !== k);
    setDraft(next);
    setAnnounce(`${KPI_BY_KEY[k].label} removed.`);
    const neighbour = next[Math.min(i, next.length - 1)];
    setFocus(`[data-kpi-slot="${neighbour}"] [data-remove]`);
  };
  const add = (k: KpiKey) => {
    if (draft.length >= MAX_KPIS || draft.includes(k)) return;
    setDraft([...draft, k]);
    setAnnounce(`${KPI_BY_KEY[k].label} added at position ${draft.length + 1}.`);
  };

  // Touch and pen: native drag-and-drop is unreliable on phones, so the grip follows the pointer
  // and the tile moves into whichever slot is under the finger.
  const touchMove = (k: KpiKey, e: React.PointerEvent) => {
    if (dragging !== k) return;
    const slot = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-kpi-slot]");
    const target = slot?.dataset.kpiSlot as KpiKey | undefined;
    if (target && target !== k) moveTo(k, draft.indexOf(target));
  };

  return (
    <>
      <ol ref={gridRef} className={GRID} aria-label="KPI tiles, in order">
        {draft.map((k, i) => {
          const label = KPI_BY_KEY[k].label;
          return (
            <li
              key={k}
              data-kpi-slot={k}
              draggable={!disabled}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k); setDragging(k); }}
              onDragOver={(e) => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(k); }}
              onDragLeave={() => setOver((o) => (o === k ? null : o))}
              onDrop={(e) => { e.preventDefault(); if (dragging) moveTo(dragging, i); setDragging(null); setOver(null); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              className={cn(
                "flex flex-col gap-1 rounded-2xl border border-dashed border-brand/40 p-1 transition-shadow",
                dragging === k && "opacity-50",
                over === k && dragging !== k && "ring-2 ring-brand/50",
              )}
            >
              {tile(k)}
              <div className="flex items-center justify-between gap-1">
                <span
                  className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded text-text-3 hover:bg-surface-2 active:cursor-grabbing"
                  title="Drag to reorder"
                  aria-hidden
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" || disabled) return; // the mouse uses native drag-and-drop
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(k);
                  }}
                  onPointerMove={(e) => touchMove(k, e)}
                  onPointerUp={() => setDragging(null)}
                  onPointerCancel={() => setDragging(null)}
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="flex items-center gap-0.5">
                  <TileButton data-move="left" label={`Move ${label} left`} disabled={disabled || i === 0} onClick={() => { moveTo(k, i - 1); setFocus(`[data-kpi-slot="${k}"] [data-move="left"]`); }}>
                    <ChevronLeft className="h-4 w-4" />
                  </TileButton>
                  <TileButton data-move="right" label={`Move ${label} right`} disabled={disabled || i === draft.length - 1} onClick={() => { moveTo(k, i + 1); setFocus(`[data-kpi-slot="${k}"] [data-move="right"]`); }}>
                    <ChevronRight className="h-4 w-4" />
                  </TileButton>
                  <TileButton data-remove label={draft.length === 1 ? `${label} is the only KPI and can't be removed` : `Remove ${label}`} disabled={disabled || draft.length === 1} onClick={() => remove(k)} danger>
                    <X className="h-4 w-4" />
                  </TileButton>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{announce}</p>
      <AddKpi picked={draft} onAdd={add} disabled={disabled} />
      {children}
    </>
  );
}

function TileButton({ label, danger, children, ...props }: { label: string; danger?: boolean; children: ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "type">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-default disabled:opacity-30", danger && "hover:text-critical-ink")}
      {...props}
    >
      {children}
    </button>
  );
}

/** "+ Add KPI": opens the catalogue KPIs not yet on the report. */
function AddKpi({ picked, onAdd, disabled }: { picked: KpiKey[]; onAdd: (k: KpiKey) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const available = KPIS.filter((k) => !picked.includes(k.key));
  const full = picked.length >= MAX_KPIS;
  if (available.length === 0) return <p className="text-xs text-text-3">Every KPI is shown.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" data-add-kpi onClick={() => setOpen((o) => !o)} disabled={disabled || full} aria-expanded={open && !full} aria-controls="add-kpi-list">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add KPI
        </Button>
        <span className="text-xs text-text-3 tabular">{full ? `The maximum of ${MAX_KPIS} KPIs is shown. Remove one to add another.` : `${picked.length} of up to ${MAX_KPIS}`}</span>
      </div>
      {open && !full && (
        <div id="add-kpi-list" className="flex flex-wrap gap-1.5" role="group" aria-label="KPIs you can add">
          {available.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => onAdd(k.key)}
              disabled={disabled}
              title={k.description}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-40"
            >
              <Plus className="h-3 w-3" aria-hidden /> {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
