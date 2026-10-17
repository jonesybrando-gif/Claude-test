"use client";

import { useActionState } from "react";
import { changePassword, saveProfile } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

function Msg({ state }: { state: { ok?: string; errors?: string[] } | undefined }) {
  return (
    <>
      {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
      {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
    </>
  );
}

export function ProfileForm({ name, staff, emailAlerts, dailySummary }: { name: string; staff: boolean; emailAlerts: boolean; dailySummary: boolean }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  const form = useFormSubmit(action);
  return (
    <form {...form} className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>
      {staff && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-text-2">Email notifications</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="emailAlerts" defaultChecked={emailAlerts} /> New alerts for my clients, as they happen</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dailySummary" defaultChecked={dailySummary} /> Daily summary of accounts that need attention (weekday mornings)</label>
        </fieldset>
      )}
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>Save</Button><Msg state={state} /></div>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const form = useFormSubmit(action, state?.ok && state);
  return (
    <form {...form} className="flex max-w-sm flex-col gap-3">
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div className="flex flex-col gap-1.5"><Label htmlFor="current">Current password</Label><Input id="current" name="current" type="password" autoComplete="current-password" required /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
      <div className="flex flex-col gap-2"><Button type="submit" disabled={pending} className="self-start">Change password</Button><Msg state={state} /></div>
    </form>
  );
}
