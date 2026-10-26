"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A button that opens a native modal <dialog> (Escape and the × close it). */
export function DialogButton({ label, title, description, children, defaultOpen = false, variant = "default", icon }: { label: string; title: string; description?: string; children: ReactNode; defaultOpen?: boolean; variant?: "default" | "outline"; icon?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (defaultOpen && ref.current && !ref.current.open) ref.current.showModal();
  }, [defaultOpen]);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => ref.current?.showModal()}>
        {icon}
        {label}
      </Button>
      <dialog
        ref={ref}
        aria-label={title}
        className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-text-3">{description}</p>}
          </div>
          <button type="button" aria-label="Close" className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text" onClick={() => ref.current?.close()}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </dialog>
    </>
  );
}

/** "⋯" row menu: a small popover holding the row's less-common actions. */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.removeAttribute("open");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.removeAttribute("open");
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text" aria-label={label}>
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex w-48 flex-col gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-lg [&_button]:w-full [&_button]:justify-start [&_form]:w-full">{children}</div>
    </details>
  );
}
