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
  if (!labels.length) return null;
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
