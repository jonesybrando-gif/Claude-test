"use client";

import { useActionState } from "react";
import { saveAlertSettings } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AlertSettings } from "@/lib/alerts";

export function AlertSettingsForm({ s }: { s: AlertSettings }) {
  const [state, action, pending] = useActionState(saveAlertSettings, undefined);
  const form = useFormSubmit(action);
  const field = (name: string, label: string, value: string | number, hint: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={String(value)} inputMode="decimal" />
      <p className="text-xs text-text-3">{hint}</p>
    </div>
  );
  return (
    <form {...form} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("overrunPct", "Projected overrun (%)", s.overrunPct, "Alert when projected month-end spend exceeds budget by more than this.")}
        {field("staleHours", "Stale data after (hours)", s.staleHours, "Alert when an account hasn't synced successfully for this long.")}
        {field("spikeMultiplier", "Spend spike multiplier (×)", s.spikeMultiplier, "Alert when a day's spend is this many times the previous 7-day average.")}
        {field("spikeMinDaily", "…only for accounts averaging at least ($/day)", (s.spikeMinDailyMinor / 100).toFixed(2), "Avoids noise on very small accounts.")}
        {field("stoppedDays", "Spend stopped after (days at $0)", s.stoppedDays, "Consecutive complete days with no spend.")}
        {field("stoppedMinDaily", "…for accounts that averaged at least ($/day)", (s.stoppedMinDailyMinor / 100).toFixed(2), "Accounts that normally spend less are ignored.")}
        {field("campaignNoSpendDays", "Enabled campaign not spending (days)", s.campaignNoSpendDays, "For enabled campaigns that spent in the two weeks before.")}
      </div>
      <p className="text-xs text-text-3">Overspending and underspending alerts follow the pacing thresholds under “Pacing &amp; branding”: only the outer bands (not “slightly”) raise alerts.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save alert settings"}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
  );
}
