"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { buttonVariants } from "./button";
import { cn } from "./cn";

export interface MenuItem {
  href: string;
  label: string;
  icon?: ReactNode;
  /** A short second line under the label. */
  hint?: string;
  /** File downloads use a plain link with the download attribute. */
  download?: boolean;
}

export interface MenuSection {
  heading?: string;
  items: MenuItem[];
}

/** A button that opens a list of links. Closes on Escape, outside click or choosing an item. */
export function Menu({ label, icon, sections, variant = "outline", align = "end" }: { label: string; icon?: ReactNode; sections: MenuSection[]; variant?: "default" | "outline"; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Move focus into the menu so keyboard users can arrow through it.
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const itemClass = "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-text hover:bg-surface-2 focus:bg-surface-2 focus:outline-none";
  return (
    <div ref={ref} className="relative">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={buttonVariants({ variant })}>
        {icon}
        {label}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} onKeyDown={onMenuKey} className={cn("absolute z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-1 shadow-lg", align === "end" ? "right-0" : "left-0")}>
          {sections.map((sec, si) => (
            <div key={si} className={cn(si > 0 && "mt-1 border-t border-border pt-1")} role="group" aria-label={sec.heading}>
              {sec.heading && <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-3">{sec.heading}</p>}
              {sec.items.map((it) => {
                const body = (
                  <>
                    {it.icon && <span className="mt-0.5 shrink-0 text-text-2">{it.icon}</span>}
                    <span className="min-w-0">
                      <span className="block">{it.label}</span>
                      {it.hint && <span className="block text-xs text-text-3">{it.hint}</span>}
                    </span>
                  </>
                );
                return it.download ? (
                  <a key={it.href} href={it.href} download role="menuitem" tabIndex={-1} className={itemClass} onClick={() => setOpen(false)}>{body}</a>
                ) : (
                  <Link key={it.href} href={it.href} role="menuitem" tabIndex={-1} className={itemClass} onClick={() => setOpen(false)}>{body}</Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
