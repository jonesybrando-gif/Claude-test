"use client";

import { useState, useTransition } from "react";
import { acknowledgeAlert, checkAlertsNow } from "./actions";
import { Button } from "@/components/ui/button";

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => acknowledgeAlert(alertId))}>
      {pending ? "Saving…" : "Acknowledge"}
    </Button>
  );
}

export function CheckNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-text-2" role="status">{msg}</span>}
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => setMsg(await checkAlertsNow()))}>
        {pending ? "Checking…" : "Check now"}
      </Button>
    </div>
  );
}
