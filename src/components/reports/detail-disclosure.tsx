"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";

/**
 * A section that starts collapsed for everyone ("Advertising detail"). Each
 * viewer's open/closed choice is remembered in this browser only; when
 * storage is unavailable it simply starts collapsed again.
 */
export function DetailDisclosure({ storageKey, title, hint, children }: { storageKey: string; title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const key = `mn:disclosure:${storageKey}`;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === "open") setOpen(true);
    } catch {
      // Private mode or blocked storage: stay collapsed.
    }
  }, [key]);

  const toggle = () => {
    setOpen((o) => {
      try {
        window.localStorage.setItem(key, o ? "closed" : "open");
      } catch {
        // Not remembered; still toggles.
      }
      return !o;
    });
  };

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          {hint && <span className="text-xs text-text-3">{hint}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-2 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
