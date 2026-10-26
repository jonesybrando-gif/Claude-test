"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyBudgetsToNextMonthAction } from "./budget-rollover-actions";

/** The banner's one button; swaps to a confirmation once the copy is done. */
export function BudgetRolloverButton({ from, to, clients }: { from: string; to: string; clients: number }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plural = (n: number) => `${n} client${n === 1 ? "" : "s"}`;

  if (done !== null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-good-ink">
        <Check className="h-4 w-4" aria-hidden /> {to} budgets are ready for {plural(done)}.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-left"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await copyBudgetsToNextMonthAction();
            if (r.ok) setDone(r.clients);
            else setError(r.error);
          })
        }
      >
        <CalendarPlus className="h-4 w-4" aria-hidden />
        {pending ? "Copying…" : `Copy ${from} budgets to ${to} (${plural(clients)})`}
      </Button>
      {error && <p role="alert" className="text-sm text-critical-ink">{error}</p>}
    </div>
  );
}
