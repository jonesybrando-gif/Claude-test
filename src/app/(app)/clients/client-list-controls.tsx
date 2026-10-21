"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tag } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LabelBadge, type LabelInfo } from "@/components/label-badge";

/** Search, label filter, sort and grouping for the Clients list, kept in the URL. */
export function ClientFilters({ labels }: { labels: LabelInfo[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("notice");
    next.delete("error");
    router.replace(`${pathname}?${next}`);
  };
  // Search updates the URL after a short pause in typing.
  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-60" aria-label="Search clients" />
      <Select value={sp.get("label") ?? ""} onChange={(e) => set("label", e.target.value)} className="w-full sm:w-48" aria-label="Filter by label">
        <option value="">All labels</option>
        {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        <option value="none">No label</option>
      </Select>
      <Select value={sp.get("sort") ?? "az"} onChange={(e) => set("sort", e.target.value === "az" ? "" : e.target.value)} className="w-full sm:w-40" aria-label="Sort">
        <option value="az">Name A–Z</option>
        <option value="za">Name Z–A</option>
        <option value="newest">Newest first</option>
      </Select>
      <label className="flex items-center gap-2 text-sm text-text-2">
        <input type="checkbox" checked={sp.get("group") === "label"} onChange={(e) => set("group", e.target.checked ? "label" : "")} className="h-4 w-4 accent-[var(--brand)]" />
        Group by label
      </label>
    </div>
  );
}

/** A small dropdown of checkboxes that saves a client's labels. */
export function LabelPicker({ action, labels, selected }: { action: (form: FormData) => Promise<void>; labels: LabelInfo[]; selected: string[] }) {
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Edit labels">
        <Tag className="h-3.5 w-3.5" aria-hidden /> Labels
      </summary>
      <form action={action} onSubmit={(e) => e.currentTarget.closest("details")?.removeAttribute("open")} className="absolute right-0 z-20 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-lg">
        {labels.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="label" value={l.id} defaultChecked={selected.includes(l.id)} className="h-4 w-4 accent-[var(--brand)]" />
            <LabelBadge label={l} />
          </label>
        ))}
        <Button type="submit" size="sm">Save labels</Button>
      </form>
    </details>
  );
}

const BULK_FORM = "bulk-labels";
const boxes = (root: ParentNode = document) => [...root.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"][name="client"]`)];

/** Row checkbox for bulk labelling; belongs to the bulk form wherever it sits in the table. */
export function SelectClientBox({ id, name }: { id: string; name: string }) {
  return <input type="checkbox" name="client" value={id} form={BULK_FORM} aria-label={`Select ${name}`} className="h-4 w-4 accent-[var(--brand)]" />;
}

/** Header checkbox: selects or clears every client row in its table. */
export function SelectAllBox() {
  return (
    <input
      type="checkbox"
      aria-label="Select all clients in this list"
      className="h-4 w-4 accent-[var(--brand)]"
      onChange={(e) => {
        const table = e.currentTarget.closest("table");
        if (!table) return;
        for (const b of boxes(table)) b.checked = e.currentTarget.checked;
        document.dispatchEvent(new Event("bulk-selection"));
      }}
    />
  );
}

/** Add or remove one label on all selected clients. */
export function BulkLabelBar({ labels, action, returnQuery }: { labels: LabelInfo[]; action: (form: FormData) => Promise<void>; returnQuery: string }) {
  const [count, setCount] = useState(0);
  // With no labels yet, start on "New label…" so the first one can be made here.
  const [choice, setChoice] = useState(labels.length ? "" : "__new__");
  useEffect(() => {
    // A client listed under several label groups counts once.
    const update = () => setCount(new Set(boxes().filter((b) => b.checked).map((b) => b.value)).size);
    const onChange = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.getAttribute?.("form") === BULK_FORM) update();
    };
    document.addEventListener("change", onChange);
    document.addEventListener("bulk-selection", update);
    update();
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("bulk-selection", update);
    };
  }, []);
  if (!labels.length) return null;
  const clear = () => {
    for (const b of boxes()) b.checked = false;
    for (const b of document.querySelectorAll<HTMLInputElement>('input[aria-label="Select all clients in this list"]')) b.checked = false;
    setCount(0);
  };
  return (
    <form id={BULK_FORM} action={action} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${count ? "border-brand bg-surface" : "border-border bg-surface-2"}`}>
      <input type="hidden" name="return" value={returnQuery} />
      <span className="font-medium">{count ? `${count} selected` : "Select clients to label them in bulk"}</span>
      <Select name="label" required value={choice} onChange={(e) => setChoice(e.target.value)} className="w-full sm:w-48" aria-label="Label to add or remove" disabled={!count}>
        <option value="" disabled>Choose a label…</option>
        {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        <option value="__new__">+ New label…</option>
      </Select>
      {choice === "__new__" && count > 0 && (
        <Input name="newLabel" required maxLength={40} placeholder="New label name" className="w-full sm:w-44" aria-label="New label name" autoFocus />
      )}
      <Button type="submit" name="mode" value="add" size="sm" disabled={!count}>Add label</Button>
      <Button type="submit" name="mode" value="remove" size="sm" variant="outline" disabled={!count || choice === "__new__"}>Remove label</Button>
      {count > 0 && <Button type="button" size="sm" variant="ghost" onClick={clear}>Clear selection</Button>}
    </form>
  );
}
