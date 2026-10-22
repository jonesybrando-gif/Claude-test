"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

export interface ChecklistStep {
  title: string;
  body: string;
  href: string;
  done: boolean;
}

/** Getting-started steps for a new agency; hides once done (or when dismissed in this browser). */
export function SetupChecklist({ steps }: { steps: ChecklistStep[] }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("mn-setup-hidden") === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-label="Getting started">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Getting started · {done} of {steps.length} done</h2>
          <div className="mt-1 h-1.5 w-48 rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        </div>
        <button
          type="button"
          className="text-xs text-text-3 hover:text-text"
          onClick={() => {
            try { localStorage.setItem("mn-setup-hidden", "1"); } catch { /* private window */ }
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.title}>
            <Link href={s.href} className={`flex h-full gap-2 rounded-lg border border-border p-3 hover:bg-surface-2 ${s.done ? "opacity-60" : ""}`}>
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good-ink" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-text-3" aria-label="To do" />}
              <span className="flex flex-col">
                <span className={`text-sm font-medium ${s.done ? "line-through" : ""}`}>{s.title}</span>
                <span className="text-xs text-text-2">{s.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
