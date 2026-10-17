"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/password-actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  const form = useFormSubmit(action);
  return (
    <form {...form} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
      {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}
