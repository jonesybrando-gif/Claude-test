"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { acknowledgeAlerts, checkAlertsNow, snoozeAlerts, unsnoozeAlerts } from "./actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export function AcknowledgeButton({ alertIds, label = "Acknowledge", variant = "outline" }: { alertIds: string[]; label?: string; variant?: "outline" | "ghost" }) {
  const [pending, start] = useTransition();
  return (
    <Button variant={variant} size="sm" disabled={pending} onClick={() => start(() => acknowledgeAlerts(alertIds))}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Snooze for 1, 3 or 7 days (or wake a snoozed alert). */
export function SnoozeControl({ alertIds, snoozed, label = "Snooze" }: { alertIds: string[]; snoozed?: boolean; label?: string }) {
  const [pending, start] = useTransition();
  if (snoozed) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => unsnoozeAlerts(alertIds))}>
        {pending ? "Saving…" : "Unsnooze"}
      </Button>
    );
  }
  return (
    <Select
      aria-label={label}
      value=""
      disabled={pending}
      onChange={(e) => {
        const days = Number(e.target.value);
        if (days) start(() => snoozeAlerts(alertIds, days));
      }}
      className="h-8 w-auto text-xs"
    >
      <option value="" disabled>{pending ? "Saving…" : label}</option>
      <option value="1">For 1 day</option>
      <option value="3">For 3 days</option>
      <option value="7">For 1 week</option>
    </Select>
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

/** Filters live in the URL so a filtered view can be shared or bookmarked. */
export function AlertFilters({ types, clients, labels, owners }: { types: [string, string][]; clients: [string, string][]; labels: [string, string][]; owners: [string, string][] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };
  const select = (k: string, all: string, opts: [string, string][], width = "sm:w-48") => (
    <Select value={sp.get(k) ?? ""} onChange={(e) => set(k, e.target.value)} className={`w-full ${width}`} aria-label={all}>
      <option value="">{all}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </Select>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {select("type", "All alert types", types)}
      {select("client", "All clients", clients)}
      {labels.length > 0 && select("label", "All labels", labels, "sm:w-40")}
      {select("owner", "All owners", owners, "sm:w-44")}
    </div>
  );
}
