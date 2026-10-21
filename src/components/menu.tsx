"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export interface MenuItem {
  label: string;
  href: string;
  description?: string;
  icon?: ReactNode;
  download?: boolean;
}

/** A dropdown of links; closes on outside click or Escape. */
export function Menu({ label, icon, items, primary, align = "right" }: { label: string; icon?: ReactNode; items: MenuItem[]; primary?: boolean; align?: "left" | "right" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className={`${buttonVariants({ variant: primary ? "default" : "outline" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {icon}
        {label}
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
      </summary>
      <div className={`absolute z-30 mt-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`} role="menu">
        {items.map((it) => (
          <a key={it.label} href={it.href} download={it.download || undefined} role="menuitem" className="flex items-start gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-2" onClick={() => ref.current && (ref.current.open = false)}>
            {it.icon && <span className="mt-0.5 text-text-2">{it.icon}</span>}
            <span className="flex flex-col">
              <span className="font-medium">{it.label}</span>
              {it.description && <span className="text-xs text-text-3">{it.description}</span>}
            </span>
          </a>
        ))}
      </div>
    </details>
  );
}
