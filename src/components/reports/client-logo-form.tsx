"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoInput } from "@/components/logo-input";
import { ClientLogoPreview } from "./client-logo-preview";
import type { LogoFormState } from "@/server/report-template-actions";

/** Upload or link the client's logo, with a preview of their report header. */
export function ClientLogoForm({ name, logoUrl, action }: { name: string; logoUrl: string | null; action: (prev: LogoFormState, form: FormData) => Promise<LogoFormState> }) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  const [value, setValue] = useState(logoUrl ?? "");
  return (
    <form action={dispatch} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        <LogoInput id="client-logo" name="logoUrl" label="Client logo" value={value} onChange={setValue} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save logo"}</Button>
          <p className="text-sm" role="status" aria-live="polite">
            {state?.ok && <span className="text-good-ink">{state.ok}</span>}
            {state?.error && <span className="text-critical-ink">{state.error}</span>}
          </p>
        </div>
      </div>
      <ClientLogoPreview name={name} logoUrl={value || null} />
    </form>
  );
}
