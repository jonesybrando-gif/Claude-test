"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import type { SetupStep } from "@/server/first-run";
import { dismissSetupChecklist } from "@/app/(app)/dashboard/actions";

/**
 * First-run checklist on Home. Hidden once every step is done, or when an
 * admin dismisses it (saved on the agency, so it stays hidden on every device).
 */
export function SetupChecklist({ steps, dismissible = true }: { steps: SetupStep[]; dismissible?: boolean }) {
  const [pending, start] = useTransition();
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <section className="rounded-xl border border-border bg-surface" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Get set up · {done} of {steps.length} done</h2>
          <p className="text-xs text-text-3">A few steps to your first useful client report.{next && <> Next: <Link href={next.href} className="text-brand hover:underline">{next.title.toLowerCase()}</Link>.</>}</p>
        </div>
        {dismissible && (
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text disabled:opacity-50"
            aria-label="Hide the setup checklist for everyone"
            title="Hide the setup checklist"
            onClick={() => start(() => dismissSetupChecklist())}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-px p-2 sm:grid-cols-2 lg:grid-cols-4">
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
