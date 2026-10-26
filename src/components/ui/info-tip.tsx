"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "./cn";

/**
 * An accessible ⓘ toggletip: a real button that shows a short plain-English
 * definition on click or tap, or when reached with the keyboard. Escape,
 * clicking elsewhere or tabbing away closes it. While open, the button is
 * described by the text (aria-describedby), so screen readers announce it.
 * Never hover-only, so it works on phones.
 */
export function InfoTip({ label, text, className, align = "start" }: { label: string; text: string; className?: string; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector("button")?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span ref={root} className={cn("relative inline-flex align-middle", className)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <button
        type="button"
        aria-label={`What is ${label.toLowerCase()}?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={(e) => {
          // Keyboard focus opens it; a click is handled by onClick (opening on its focus would close it again).
          try {
            if (e.currentTarget.matches(":focus-visible")) setOpen(true);
          } catch {
            // Older browsers without :focus-visible: click still works.
          }
        }}
        className="-m-1 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cn(
          "absolute top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs leading-relaxed font-normal normal-case text-text shadow-lg whitespace-normal",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {text}
      </span>
    </span>
  );
}
