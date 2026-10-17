"use client";

import { useActionState } from "react";
import { setPasswordWithToken } from "@/app/password-actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SetPasswordForm({ kind, token, email }: { kind: "INVITE" | "PASSWORD_RESET"; token: string; email: string }) {
  const [state, action, pending] = useActionState(setPasswordWithToken.bind(null, kind, token), undefined);
  const form = useFormSubmit(action);
  return (
    <form {...form} className="flex flex-col gap-4">
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        <p className="text-xs text-text-3">At least 10 characters, mixing letters with numbers or symbols.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : kind === "INVITE" ? "Set password and sign in" : "Save new password"}</Button>
    </form>
  );
}
