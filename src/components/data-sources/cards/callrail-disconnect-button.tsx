"use client";

import { useState, useTransition } from "react";
import { disconnectCallRail } from "@/server/data-sources/callrail/actions";
import { Button } from "@/components/ui/button";

/** Two-step inline confirmation (no browser dialog). */
export function CallRailDisconnectButton({ connectionId }: { connectionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return <Button type="button" variant="ghost" size="sm" className="text-critical-ink" onClick={() => setConfirming(true)}>Disconnect</Button>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Confirm disconnect">
      <span className="text-text-2">Delete the stored key and stop syncing? Existing call data is kept.</span>
      <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => startTransition(() => disconnectCallRail(connectionId))}>
        {pending ? "Disconnecting…" : "Yes, disconnect"}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  );
}
