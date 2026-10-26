"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface ComboOption {
  value: string;
  label: string;
}

/**
 * Searchable single-choice picker that submits through a hidden input, so it
 * drops into a plain <form> like a <select>. Used where a native select would
 * hold dozens of options (e.g. linking 78 CallRail companies to clients):
 * type a few letters, arrow keys + Enter, or click.
 *
 * The list is portalled with fixed positioning so it is never clipped by, or
 * scrolls, the overflow container of the table it sits in.
 */
export function ClientCombobox({
  name,
  options,
  defaultValue = "",
  emptyLabel,
  ariaLabel,
  className,
  onChange,
  buttonContent,
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: string;
  /** Label for the "" value, e.g. "Don't monitor". Omit to offer no empty choice. */
  emptyLabel?: string;
  ariaLabel: string;
  className?: string;
  /** Called with the chosen value (e.g. to navigate), as well as updating the hidden input. */
  onChange?: (value: string) => void;
  /** Replaces the button's text (the selected label), e.g. an icon for a compact switcher. */
  buttonContent?: ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const all = useMemo(() => (emptyLabel === undefined ? options : [{ value: "", label: emptyLabel }, ...options]), [options, emptyLabel]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q));
  }, [all, query]);
  const selected = all.find((o) => o.value === value) ?? all[0] ?? { value: "", label: "" };

  // Keep the hidden input in sync for form.reset() (restores defaultValue).
  const hiddenRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const onReset = () => setValue(defaultValue);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 300 && r.top > below;
      setPos({ left: r.left, width: Math.max(r.width, 260), top: up ? r.top - 4 : r.bottom + 4, up });
    };
    place();
    // Close when the page scrolls away from the field rather than chasing it.
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || listRef.current?.parentElement?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open, pos]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const openList = () => {
    setQuery("");
    setActive(Math.max(0, all.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (v: string) => {
    setValue(v);
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
    if (v !== value) onChange?.(v);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = filtered[active]; if (o) choose(o.value); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); buttonRef.current?.focus({ preventScroll: true }); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <>
      <input ref={hiddenRef} type="hidden" name={name} value={value} />
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); openList(); }
          else if (!open && e.key.length === 1 && /\S/.test(e.key)) { openList(); setQuery(e.key); setActive(0); e.preventDefault(); }
        }}
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          value ? "text-text" : "text-text-2",
          className,
        )}
      >
        {buttonContent ?? (
          <>
            <span className="truncate">{selected.label}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-3" aria-hidden />
          </>
        )}
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 flex max-h-[300px] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search clients…"
              aria-label="Search clients"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              className="border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
            />
            <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="overflow-y-auto overscroll-contain py-1">
              {filtered.map((o, i) => (
                <li
                  key={o.value || "_none"}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "cursor-pointer truncate px-3 py-1.5 text-sm",
                    i === active && "ui-selected",
                    o.value === value && "font-medium",
                    !o.value && "text-text-2",
                  )}
                >
                  {o.label}
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-2 text-sm text-text-3">No matching client</li>}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
