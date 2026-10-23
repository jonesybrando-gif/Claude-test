"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import type { SetupStep } from "@/server/first-run";

const KEY = "mn:setup-checklist-hidden";

/** First-run checklist on the dashboard. Hidden once every step is done, or when dismissed in this browser. */
export function SetupChecklist({ steps, dismissible = true }: { steps: SetupStep[]; dismissible?: boolean }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(dismissible && localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable: keep showing it */
    }
  }, [dismissible]);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <section className="rounded-xl border border-border bg-surface" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Get set up · {done} of {steps.length} done</h2>
          <p className="text-xs text-text-3">A few steps to your first useful client report.</p>
        </div>
        {dismissible && (
          <button type="button" className="rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text cursor-pointer" aria-label="Hide the setup checklist" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-px p-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <Link href={s.href} className={`flex h-full gap-2.5 rounded-lg px-3 py-2.5 hover:bg-surface-2 ${s === next ? "bg-surface-2/60 ring-1 ring-border" : ""}`}>
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good-ink" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-text-3" aria-label="To do" />}
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${s.done ? "text-text-3 line-through" : ""}`}>{i + 1}. {s.title}</span>
                <span className="block text-xs text-text-3">{s.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
