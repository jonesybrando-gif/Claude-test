"use client";

import { useActionState, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { draftEmailAction, sendClientEmailAction } from "@/server/ai/actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { PRESET_LABEL } from "@/lib/date-ranges";

const textarea = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const RANGES = ["last_month", "mtd", "last_7", "last_30", "last_90"] as const;

export function EmailComposer({ clientId, purposes, defaultTo, defaultRange, aiOn }: { clientId: string; purposes: Record<string, string>; defaultTo: string; defaultRange: string; aiOn: boolean }) {
  const [draftState, draftAction, drafting] = useActionState(draftEmailAction.bind(null, clientId), undefined);
  const [sendState, sendAction, sending] = useActionState(sendClientEmailAction.bind(null, clientId), undefined);
  const draftForm = useFormSubmit(draftAction);
  const sendForm = useFormSubmit(sendAction);
  const [confirming, setConfirming] = useState(false);
  const draft = draftState?.draft;

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form {...draftForm} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 self-start">
        <p className="text-sm font-medium">1. Draft with AI</p>
        {!aiOn && <p className="text-xs text-warning-ink">The AI assistant is off (no ANTHROPIC_API_KEY). You can still write and send the email yourself.</p>}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purpose">What&apos;s it for?</Label>
          <Select id="purpose" name="purpose" defaultValue="monthly_update">
            {Object.entries(purposes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="range">Data from</Label>
          <Select id="range" name="range" defaultValue={defaultRange}>
            {RANGES.map((r) => <option key={r} value={r}>{PRESET_LABEL[r]}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipientName">Greeting name (optional)</Label>
          <Input id="recipientName" name="recipientName" placeholder="e.g. Dana" maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Your notes (optional)</Label>
          <textarea id="notes" name="notes" rows={4} maxLength={2000} className={textarea} placeholder="Anything to mention or avoid, e.g. “new landing page went live on the 12th; propose +$500 for May”." />
        </div>
        <Button type="submit" disabled={drafting || !aiOn}>
          <Sparkles className="h-4 w-4" aria-hidden /> {drafting ? "Drafting…" : draft ? "Draft again" : "Draft email"}
        </Button>
        {draftState?.error && <p className="text-sm text-critical-ink" role="alert">{draftState.error}</p>}
        <p className="text-xs text-text-3">The draft uses only this client&apos;s report figures. Nothing is sent until you press Send.</p>
      </form>

      <form key={draftState?.n ?? 0} {...sendForm} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium">2. Review, edit and send</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" defaultValue={defaultTo} placeholder="name@client.com, other@client.com" />
          <p className="text-xs text-text-3">Separate addresses with commas. Replies go to you.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" defaultValue={draft?.subject ?? ""} maxLength={200} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="body">Message</Label>
          <textarea id="body" name="body" rows={16} defaultValue={draft?.body ?? ""} className={textarea} />
          {draft && <p className="text-xs text-text-3">AI-drafted. Check every figure and claim before sending.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <Button type="submit" disabled={sending} onClick={() => setTimeout(() => setConfirming(false), 0)}><Send className="h-4 w-4" aria-hidden /> {sending ? "Sending…" : "Yes, send now"}</Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            </>
          ) : (
            <Button type="button" onClick={() => setConfirming(true)}><Send className="h-4 w-4" aria-hidden /> Send…</Button>
          )}
          {sendState?.ok && <p className="text-sm text-good-ink" role="status">{sendState.ok}</p>}
          {sendState?.error && <p className="text-sm text-critical-ink" role="alert">{sendState.error}</p>}
        </div>
      </form>
    </div>
  );
}
