"use client";

import { useActionState } from "react";
import type { Platform } from "@prisma/client";
import { connectWithToken } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function TokenConnectForm({ platform }: { platform: Platform }) {
  const [state, action, pending] = useActionState(connectWithToken.bind(null, platform), undefined);
  const form = useFormSubmit(action, state?.ok && state);
  return (
    <details className="rounded-lg border border-border p-3 text-xs">
      <summary className="cursor-pointer font-medium text-text-2">Use a Business Manager system-user token instead (does not expire)</summary>
      <form {...form} className="mt-2 flex flex-col gap-2">
        <Label htmlFor={`token-${platform}`}>System-user access token with ads_read</Label>
        <Input id={`token-${platform}`} name="token" type="password" autoComplete="off" required />
        <p className="text-text-3">The token is checked with Meta, encrypted, and never shown again.</p>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Checking…" : "Connect with token"}</Button>
          {state?.ok && <span className="text-good-ink" role="status">{state.ok}</span>}
          {state?.errors?.map((e) => <span key={e} className="text-critical-ink" role="alert">{e}</span>)}
        </div>
      </form>
    </details>
  );
}
