"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarClock, Check, Copy, Link2, Send } from "lucide-react";
import { createShareLinkAction, saveScheduleAction, sendScheduleNowAction } from "./actions";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { SCHEDULE_RANGES, WEEKDAYS, type ScheduleFrequency, type ScheduleRange } from "@/lib/report-schedule";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copied" : label}
    </Button>
  );
}

export function CreateShareLinkForm({ clientId, ranges }: { clientId: string; ranges: [string, string][] }) {
  const [state, action, pending] = useActionState(createShareLinkAction.bind(null, clientId), undefined);
  const form = useFormSubmit(action, state?.n);
  return (
    <div className="flex flex-col gap-4">
      <form {...form} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_160px_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label">Note for yourself (optional)</Label>
          <Input id="label" name="label" maxLength={80} placeholder="e.g. Sent to Dana, October" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="range">Date range</Label>
          <Select id="range" name="range" defaultValue="template">
            {ranges.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expiry">Expires</Label>
          <Select id="expiry" name="expiry" defaultValue="90">
            <option value="7">In 7 days</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
            <option value="never">Never</option>
          </Select>
        </div>
        <Button type="submit" disabled={pending}><Link2 className="h-4 w-4" aria-hidden /> {pending ? "Creating…" : "Create link"}</Button>
      </form>
      {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
      {state?.url && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-good-bg px-3 py-2" role="status">
          <span className="text-sm font-medium text-good-ink">Link created:</span>
          <code className="min-w-0 flex-1 truncate text-xs" data-testid="new-link">{state.url}</code>
          <CopyButton text={state.url} />
        </div>
      )}
    </div>
  );
}

export function RevokeButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm("Turn off this link? Anyone using it will no longer be able to open the report. This can't be undone.")) e.preventDefault(); }}>
      <Button type="submit" variant="outline" size="sm">Turn off</Button>
    </form>
  );
}

export interface ScheduleValues {
  enabled: boolean;
  frequency: ScheduleFrequency;
  dayOfMonth: number;
  dayOfWeek: number;
  recipients: string;
  range: ScheduleRange;
}

/** Email the client-facing PDF, with the summary in the body, on a set day. */
export function ScheduleForm({ clientId, values, exists }: { clientId: string; values: ScheduleValues; exists: boolean }) {
  const [state, action, pending] = useActionState(saveScheduleAction.bind(null, clientId), undefined);
  const [testState, testAction, testing] = useActionState(sendScheduleNowAction.bind(null, clientId), undefined);
  const [frequency, setFrequency] = useState<ScheduleFrequency>(values.frequency);
  const form = useFormSubmit(action);
  const [, startTest] = useTransition();
  return (
    <form {...form} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} className="h-4 w-4 accent-[var(--brand)]" />
        Send this report automatically
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="frequency">How often</Label>
          <Select id="frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </Select>
        </div>
        {frequency === "monthly" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dayOfMonth">Day of the month</Label>
            <Select id="dayOfMonth" name="dayOfMonth" defaultValue={String(values.dayOfMonth)}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dayOfWeek">Day of the week</Label>
            <Select id="dayOfWeek" name="dayOfWeek" defaultValue={String(values.dayOfWeek)}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-range">Report covers</Label>
          <Select id="schedule-range" name="range" defaultValue={values.range}>
            {SCHEDULE_RANGES.map((r) => <option key={r} value={r}>{PRESET_LABEL[r]}</option>)}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipients">Recipients</Label>
        <Input id="recipients" name="recipients" defaultValue={values.recipients} placeholder="dana@client.com, ops@client.com" />
        <p className="text-xs text-text-3">Separate addresses with commas. Sent at 8:00 in the client&apos;s time zone; replies go to the account manager.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}><CalendarClock className="h-4 w-4" aria-hidden /> {pending ? "Saving…" : exists ? "Save schedule" : "Create schedule"}</Button>
        <Button type="button" variant="outline" disabled={testing} onClick={() => { const fd = new FormData(form.ref.current!); startTest(() => testAction(fd)); }} title="Send the report to these recipients now, without changing the schedule">
          <Send className="h-4 w-4" aria-hidden /> {testing ? "Sending…" : "Send now"}
        </Button>
      </div>
      {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
      {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
      {testState?.ok && <p className="text-sm text-good-ink" role="status">{testState.ok}</p>}
      {testState?.error && <p className="text-sm text-critical-ink" role="alert">{testState.error}</p>}
    </form>
  );
}
