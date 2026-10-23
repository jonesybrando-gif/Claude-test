"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, CornerDownLeft, Search } from "lucide-react";
import { cn } from "./ui/cn";

export interface PaletteItem {
  href: string;
  label: string;
  /** "Client" or "Page"; shown on the right and used for grouping. */
  kind: "Client" | "Page";
  hint?: string;
}

/**
 * App-wide search and client switcher. Opens with Cmd-K / Ctrl-K (or "/"
 * outside text fields) and from the sidebar button; type to filter clients
 * and pages, arrow keys to move, Enter to open.
 */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
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
    const needle = q.trim().toLowerCase();
    if (!needle) return [...items.filter((i) => i.kind === "Page"), ...items.filter((i) => i.kind === "Client")].slice(0, 50);
    const score = (i: PaletteItem) => {
      const l = i.label.toLowerCase();
      if (l.startsWith(needle)) return 0;
      if (l.split(/\s+/).some((w) => w.startsWith(needle))) return 1;
      return l.includes(needle) ? 2 : 3;
    };
    return items
      .map((i) => ({ i, s: score(i) }))
      .filter((x) => x.s < 3)
      .sort((a, b) => a.s - b.s || (a.i.kind === b.i.kind ? 0 : a.i.kind === "Client" ? -1 : 1) || a.i.label.localeCompare(b.i.label))
      .map((x) => x.i)
      .slice(0, 50);
  }, [items, q]);

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search clients and pages"
        className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-3 hover:text-text cursor-pointer"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search clients…</span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 text-[11px] font-medium md:inline">{mac ? "⌘" : "Ctrl "}K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-text-3" aria-hidden />
              <input
                ref={input}
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
                  else if (e.key === "Escape") { e.preventDefault(); close(); }
                }}
                placeholder="Search clients and pages…"
                className="h-12 flex-1 bg-transparent text-sm text-text placeholder:text-text-3 focus:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
              />
              <kbd className="rounded border border-border px-1.5 text-[11px] text-text-3">Esc</kbd>
            </div>
            <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-1">
              {results.map((r, i) => (
                <li
                  key={r.href}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm", i === active ? "bg-surface-2 text-text" : "text-text-2")}
                >
                  {r.kind === "Client" ? <Building2 className="h-4 w-4 shrink-0 text-text-3" aria-hidden /> : <CornerDownLeft className="h-4 w-4 shrink-0 text-text-3" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{r.label}{r.hint && <span className="text-text-3"> · {r.hint}</span>}</span>
                  <span className="text-[11px] text-text-3">{r.kind}</span>
                </li>
              ))}
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-3">No clients or pages match “{q}”.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
