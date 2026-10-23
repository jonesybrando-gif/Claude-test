"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { disconnectMetaOrganic } from "@/server/data-sources/meta-organic/actions";

/** Two-step inline confirmation (no window.confirm). */
export function MetaOrganicDisconnect({ connectionId }: { connectionId: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-critical-ink" onClick={() => setAsking(true)}>
        Disconnect
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Confirm disconnect" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-critical-bg px-2 py-1 text-xs text-critical-ink">
      <span>Stop syncing every Page and Instagram account from this login? Existing data is kept.</span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await disconnectMetaOrganic(connectionId);
            } catch {
              setError("Could not disconnect. Try again.");
            }
          })
        }
      >
        {pending ? "Disconnecting…" : "Yes, disconnect"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
        Cancel
      </Button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
