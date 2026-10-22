"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export interface PaletteItem {
  label: string;
  href: string;
  /** "Client" or "Page"; shown on the right. */
  kind: string;
  hint?: string;
}

/** Search clients and pages from anywhere: ⌘K / Ctrl+K, or the sidebar button. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? items.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(term)) : items;
    // Names that start with the search come first.
    return [...list].sort((a, b) => Number(!a.label.toLowerCase().startsWith(term)) - Number(!b.label.toLowerCase().startsWith(term))).slice(0, 12);
  }, [items, q]);

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-3 hover:text-text-2"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="flex-1 text-left">Search clients…</span>
        <kbd className="hidden rounded border border-border px-1.5 text-[11px] md:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-text-3" aria-hidden />
              <input
                ref={input}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
                }}
                placeholder="Search clients and pages…"
                aria-label="Search clients and pages"
                className="h-12 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto p-1" role="listbox">
              {results.map((r, i) => (
                <li key={r.href} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${i === active ? "bg-surface-2" : ""}`}
                  >
                    <span className="truncate">{r.label}</span>
                    <span className="shrink-0 text-xs text-text-3">{r.kind}</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-3">No matches.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
