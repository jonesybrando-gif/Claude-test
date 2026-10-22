"use client";

import { useActionState, useState, useTransition } from "react";
import { saveScheduleAction, sendNowAction, type ScheduleState } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export interface ScheduleValues {
  dayOfMonth: number;
  recipients: string;
  range: string;
  attachPdf: boolean;
  includeLink: boolean;
  active: boolean;
}

const RANGES: [string, string][] = [["last_month", "Last month"], ["last_30", "Last 30 days"], ["mtd", "Month to date"]];

export function ScheduleForm({ clientId, values, saved }: { clientId: string; values: ScheduleValues; saved: boolean }) {
  const [state, action, pending] = useActionState(saveScheduleAction.bind(null, clientId), undefined);
  const form = useFormSubmit(action);
  const [sendState, setSendState] = useState<ScheduleState>(undefined);
  const [sending, start] = useTransition();
  const send = (toSelf: boolean) => start(async () => setSendState(await sendNowAction(clientId, toSelf)));
  return (
    <div className="flex flex-col gap-5">
      <form {...form} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dayOfMonth">Send on day</Label>
            <Select id="dayOfMonth" name="dayOfMonth" defaultValue={String(values.dayOfMonth)}>
              {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </Select>
            <p className="text-xs text-text-3">of each month, at 8:00 in the client&apos;s time zone. Day 2 or later gives the platforms a day to settle last month&apos;s numbers.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="range">Report covers</Label>
            <Select id="range" name="range" defaultValue={values.range}>
              {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipients">Send to</Label>
          <Input id="recipients" name="recipients" defaultValue={values.recipients} placeholder="owner@client.com, marketing@client.com" />
          <p className="text-xs text-text-3">Up to 10 addresses, separated by commas. Each gets the email separately.</p>
        </div>
        <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <legend className="mb-1 text-xs font-medium text-text-2">Include</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="includeLink" defaultChecked={values.includeLink} className="h-4 w-4 accent-[var(--brand)]" /> A link to the web report (works for 90 days)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="attachPdf" defaultChecked={values.attachPdf} className="h-4 w-4 accent-[var(--brand)]" /> The PDF report</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={values.active} className="h-4 w-4 accent-[var(--brand)]" /> Scheduled sending is on</label>
        </fieldset>
        <p className="text-xs text-text-3">The email body is the executive summary (overview, what&apos;s working, what needs attention, recommendations), formatted for email.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save schedule"}</Button>
          {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
          {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
        </div>
      </form>
      {saved && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => send(true)}>{sending ? "Sending…" : "Send a test to me"}</Button>
          <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => { if (window.confirm("Send the report to the client's recipients now?")) send(false); }}>Send to recipients now</Button>
          {sendState?.ok && <p className="text-sm text-good-ink" role="status">{sendState.ok}</p>}
          {sendState?.error && <p className="text-sm text-critical-ink" role="alert">{sendState.error}</p>}
        </div>
      )}
    </div>
  );
}
