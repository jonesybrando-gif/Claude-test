"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { unlockShareAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SharePasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unlockShareAction.bind(null, token), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" aria-hidden /> This report is password protected</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoFocus autoComplete="current-password" />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "View report"}</Button>
      {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
    </form>
  );
}
