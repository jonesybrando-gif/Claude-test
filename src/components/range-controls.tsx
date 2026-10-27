"use client";

import { startNavigationProgress } from "@/components/navigation-progress";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { PRESET_LABEL, type CompareMode, type RangePreset } from "@/lib/date-ranges";
import { encodeRangeCookie, RANGE_COOKIE, RANGE_COOKIE_MAX_AGE } from "@/lib/client-nav";
import { Input, Select } from "./ui/input";

/** Remember the choice so the next report opens on the same dates. */
function rememberRange(v: { range: string; compare: string; from: string | null; to: string | null }) {
  try {
    document.cookie = `${RANGE_COOKIE}=${encodeURIComponent(encodeRangeCookie(v))}; Max-Age=${RANGE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {
    // Cookies blocked: the URL still carries the range.
  }
}

export function RangeControls({ preset, compare, from, to }: { preset: RangePreset; compare: CompareMode; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const range = next.get("range") ?? preset;
    rememberRange({
      range,
      compare: next.get("compare") ?? compare,
      from: range === "custom" ? next.get("from") ?? from : null,
      to: range === "custom" ? next.get("to") ?? to : null,
    });
    // Keep the range explicit in the URL so the page doesn't depend on the cookie.
    if (!next.get("range")) next.set("range", preset);
    startNavigationProgress();
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Date range" value={preset} onChange={(e) => set({ range: e.target.value, ...(e.target.value !== "custom" ? { from: null, to: null } : { from, to }) })} className="w-40">
        {(Object.keys(PRESET_LABEL) as RangePreset[]).map((p) => (
          <option key={p} value={p}>{PRESET_LABEL[p]}</option>
        ))}
      </Select>
      {preset === "custom" && (
        <>
          <Input type="date" aria-label="From" defaultValue={from} onBlur={(e) => e.target.value && set({ from: e.target.value })} className="w-38" />
          <Input type="date" aria-label="To" defaultValue={to} onBlur={(e) => e.target.value && set({ to: e.target.value })} className="w-38" />
        </>
      )}
      <Select aria-label="Compare to" value={compare} onChange={(e) => set({ compare: e.target.value })} className="w-48">
        <option value="previous_month">vs. previous month</option>
        <option value="previous_period">vs. previous period</option>
        <option value="none">No comparison</option>
      </Select>
    </div>
  );
}

/**
 * Phones: a one-line button ("Sep 1–30 ▾") that opens the range and
 * comparison controls in a small panel, so the header stays short.
 */
export function CompactRangeControls({ label, ...props }: { label: string; preset: RangePreset; compare: CompareMode; from: string; to: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  // Close after a choice navigates.
  const params = useSearchParams();
  const qs = params.toString();
  useEffect(() => setOpen(false), [qs]);
  return (
    <div ref={box} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 max-w-full items-center gap-1 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 cursor-pointer"
      >
        <span className="sr-only">Date range: </span>
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-3" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Date range" className="absolute left-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-lg">
          <RangeControls {...props} />
        </div>
      )}
    </div>
  );
}
