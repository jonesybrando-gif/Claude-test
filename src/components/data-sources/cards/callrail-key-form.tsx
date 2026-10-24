"use client";

import { useActionState, useId } from "react";
import { saveCallRailKey } from "@/server/data-sources/callrail/actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Paste a CallRail v3 API key: connects a new account, or replaces the key on `connectionId`. */
export function CallRailKeyForm({ connectionId, submitLabel }: { connectionId?: string; submitLabel: string }) {
  const [state, action, pending] = useActionState(saveCallRailKey, undefined);
  const form = useFormSubmit(action, state?.ok && state);
  const id = useId();
  return (
    <form {...form} className="flex flex-col gap-2 text-xs">
      {connectionId && <input type="hidden" name="connectionId" value={connectionId} />}
      <Label htmlFor={id}>CallRail API key (v3)</Label>
      <Input id={id} name="apiKey" type="password" autoComplete="off" spellCheck={false} required />
      <p className="text-text-3">Create one in CallRail under Settings → API Keys. It&apos;s checked with CallRail, encrypted, and never shown again.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Checking…" : submitLabel}</Button>
        {state?.ok && <span className="text-good-ink" role="status">{state.ok}</span>}
        {state?.error && <span className="text-critical-ink" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}
