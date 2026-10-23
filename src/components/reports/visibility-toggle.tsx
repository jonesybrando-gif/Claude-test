"use client";

import { useOptimistic, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setSectionVisibilityAction } from "@/server/report-template-actions";
import type { SectionKey } from "@/lib/report-template";

/** A switch for whether a section appears in the client-facing report, link and PDF. */
export function ClientVisibilityToggle({ clientId, section, visible, label }: { clientId: string; section: SectionKey; visible: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(visible);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? "shown to the client" : "hidden from the client"}`}
      disabled={pending}
      onClick={() => start(async () => { setOn(!on); await setSectionVisibilityAction(clientId, section, !on); })}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium cursor-pointer disabled:opacity-60 ${on ? "border-transparent bg-good-bg text-good-ink" : "border-border bg-surface-2 text-text-2"}`}
    >
      <span className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${on ? "bg-good" : "bg-text-3/40"}`} aria-hidden>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
      </span>
      {on ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
      {on ? "Client sees this" : "Hidden from client"}
    </button>
  );
}
