"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { unlockShareAction } from "./unlock";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function UnlockForm({ token, agencyName }: { token: string; agencyName: string }) {
  const [state, action, pending] = useActionState(unlockShareAction.bind(null, token), undefined);
  return (
    <form action={action} className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center gap-2"><Lock className="h-5 w-5 text-text-2" aria-hidden /><h1 className="text-lg font-semibold">This report is password protected</h1></div>
      <p className="text-sm text-text-2">Enter the password {agencyName} gave you.</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "View report"}</Button>
      {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
    </form>
  );
}
