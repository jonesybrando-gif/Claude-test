"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { refreshAccount } from "@/app/(app)/integrations/actions";

export function RefreshAccountButton({ accountId }: { accountId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshAccount(accountId);
            setMessage(r.status === "SUCCEEDED" ? "Updated" : r.status === "SKIPPED" ? "Sync already running" : `Failed: ${r.error ?? "unknown error"}`);
          })
        }
        className="inline-flex items-center gap-1 text-xs text-text-2 hover:text-text disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} aria-hidden /> {pending ? "Refreshing…" : "Refresh now"}
      </button>
      {message && <span className={`text-xs whitespace-normal ${message.startsWith("Failed") ? "text-critical-ink" : "text-text-3"}`} role="status">{message}</span>}
    </span>
  );
}
