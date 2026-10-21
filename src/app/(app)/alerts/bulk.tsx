"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const FORM = "bulk-alerts";
const boxes = (root: ParentNode = document) => [...root.querySelectorAll<HTMLInputElement>(`input[form="${FORM}"][name="alert"]`)];

export function AlertBox({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="alert" value={id} form={FORM} aria-label={`Select: ${label}`} className="mt-1 h-4 w-4 accent-[var(--brand)]" />;
}

/** Selects every alert in one client's group. */
export function SelectGroup({ label }: { label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={`Select all alerts for ${label}`}
      className="h-4 w-4 accent-[var(--brand)]"
      onChange={(e) => {
        const group = e.currentTarget.closest("section");
        if (group) for (const b of boxes(group)) b.checked = e.currentTarget.checked;
        document.dispatchEvent(new Event("alert-selection"));
      }}
    />
  );
}

export function AlertBulkBar({ action, snoozedView }: { action: (form: FormData) => Promise<void>; snoozedView: boolean }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(boxes().filter((b) => b.checked).length);
    const onChange = (e: Event) => (e.target as HTMLElement | null)?.getAttribute?.("form") === FORM && update();
    document.addEventListener("change", onChange);
    document.addEventListener("alert-selection", update);
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("alert-selection", update);
    };
  }, []);
  return (
    <form id={FORM} action={action} className={`sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${count ? "border-brand bg-surface" : "border-border bg-surface-2"}`}>
      <span className="font-medium">{count ? `${count} selected` : "Select alerts to act on several at once"}</span>
      {snoozedView ? (
        <Button type="submit" name="mode" value="unsnooze" size="sm" variant="outline" disabled={!count}>Unsnooze</Button>
      ) : (
        <>
          <Button type="submit" name="mode" value="ack" size="sm" disabled={!count}>Acknowledge</Button>
          <Button type="submit" name="mode" value="snooze1" size="sm" variant="outline" disabled={!count}>Snooze 1 day</Button>
          <Button type="submit" name="mode" value="snooze7" size="sm" variant="outline" disabled={!count}>Snooze 7 days</Button>
        </>
      )}
    </form>
  );
}
