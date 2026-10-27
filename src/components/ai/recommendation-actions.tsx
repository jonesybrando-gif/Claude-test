"use client";

import { useState, useTransition } from "react";
import { planRecommendationAction, setInsightStatusAction } from "@/app/(app)/clients/[id]/next-steps-actions";
import { Button } from "@/components/ui/button";

const REASONS = ["Not relevant to this client", "Already handled", "Disagree with the data", "Not now"];

/**
 * What the agency does with one AI recommendation: mark it reviewed, plan it
 * (creates a draft next step for the client report, hidden until approved),
 * dismiss it with a reason, or reopen it. Nothing changes in the ad accounts.
 */
export function RecommendationActions({ clientId, title, status }: { clientId: string; title: string; status: string }) {
  const [pending, start] = useTransition();
  const [dismissing, setDismissing] = useState(false);
  const act = (fn: () => Promise<void>) => start(fn);
  if (status === "PLANNED" || status === "DONE" || status === "DISMISSED") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {status === "PLANNED" && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(() => setInsightStatusAction(clientId, title, "DONE"))} title="Records that your team finished this. The client's next step is marked done separately, on the Reports tab, with its date.">
            Mark completed
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setInsightStatusAction(clientId, title, "NEW"))}>
          Reopen
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => act(() => planRecommendationAction(clientId, title))} title="Creates a draft next step for the client report. Nothing is shown to the client until you approve it.">
        Plan it
      </Button>
      {status !== "REVIEWED" && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(() => setInsightStatusAction(clientId, title, "REVIEWED"))}>
          Mark reviewed
        </Button>
      )}
      {dismissing ? (
        <select
          aria-label="Why dismiss it?"
          defaultValue=""
          disabled={pending}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
          onChange={(e) => e.target.value && act(() => setInsightStatusAction(clientId, title, "DISMISSED", e.target.value))}
        >
          <option value="" disabled>Why dismiss it?</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      ) : (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDismissing(true)}>
          Dismiss…
        </Button>
      )}
    </div>
  );
}
