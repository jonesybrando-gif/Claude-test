"use client";

import { Button } from "@/components/ui/button";

/** A one-button form for a bound server action, with an optional confirmation. */
export function ActionButton({ action, label, confirm, variant = "outline", disabled, title }: { action: () => Promise<void>; label: string; confirm?: string; variant?: "outline" | "ghost" | "default" | "destructive"; disabled?: boolean; title?: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      <Button type="submit" variant={variant} size="sm" disabled={disabled} title={title}>{label}</Button>
    </form>
  );
}
