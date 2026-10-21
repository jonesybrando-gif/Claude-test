"use client";

import { useActionState } from "react";
import { saveSettings } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface SettingsValues {
  name: string;
  brandColor: string;
  logoUrl: string;
  reportHeader: string;
  reportFooter: string;
  under: number;
  slightlyUnder: number;
  slightlyOver: number;
  over: number;
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  const form = useFormSubmit(action);
  const field = (name: keyof SettingsValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={String(values[name])} {...props} />
    </div>
  );
  return (
    <form {...form} className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Pacing thresholds</CardTitle>
          <CardDescription>Pacing % = actual spend ÷ expected spend to date × 100. These apply to every client unless overridden.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          {field("under", "Underspending below (%)", { inputMode: "decimal" })}
          {field("slightlyUnder", "Slightly under below (%)", { inputMode: "decimal" })}
          {field("slightlyOver", "On target up to (%)", { inputMode: "decimal" })}
          {field("over", "Slightly over up to (%)", { inputMode: "decimal" })}
          <p className="text-xs text-text-3 sm:col-span-4">Defaults: under 85% underspending · 85–95% slightly under · 95–105% on target · above 105–115% slightly over · above 115% overspending.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>White-label branding</CardTitle>
          <CardDescription>Shown in the app, client report links, PDFs and report emails.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {field("name", "Agency name", { required: true })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brandColor">Brand color</Label>
            <div className="flex gap-2">
              <Input id="brandColor" name="brandColor" defaultValue={values.brandColor} pattern="^#[0-9a-fA-F]{6}$" />
              <input type="color" aria-label="Pick brand color" defaultValue={values.brandColor} onChange={(e) => ((document.getElementById("brandColor") as HTMLInputElement).value = e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border" />
            </div>
          </div>
          {field("logoUrl", "Logo URL (https)", { type: "url", placeholder: "https://…" })}
          <div />
          {field("reportHeader", "Report header text")}
          {field("reportFooter", "Report footer text")}
        </CardContent>
      </Card>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
        {state?.ok && <p className="text-sm text-good-ink" role="status">{state.ok}</p>}
        {state?.errors?.map((e) => <p key={e} className="text-sm text-critical-ink" role="alert">{e}</p>)}
      </div>
    </form>
  );
}
