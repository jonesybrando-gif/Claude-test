"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { createShareLinkAction } from "./actions";
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
      <form {...form} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_150px_180px_auto] lg:items-end">
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password (optional)</Label>
          <Input id="password" name="password" type="text" autoComplete="off" minLength={6} maxLength={64} placeholder="None" />
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
