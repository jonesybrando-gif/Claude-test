"use client";

import { useActionState, useEffect, useState } from "react";
import { saveSettings } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface SettingsValues {
  name: string;
  brandColor: string;
  logoUrl: string;
  /** What the app shows today (uploaded image or URL). */
  currentLogo: string | null;
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
  // Live preview of the branding as you edit it.
  const [preview, setPreview] = useState({ name: values.name, color: values.brandColor, logo: values.currentLogo, header: values.reportHeader });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  const field = (name: keyof SettingsValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={String(values[name] ?? "")} {...props} />
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
          <div className="sm:col-span-2" aria-label="Branding preview">
            <p className="mb-1.5 text-xs font-medium text-text-2">Preview: client report header</p>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="h-1.5" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(preview.color) ? preview.color : values.brandColor }} />
              <div className="flex items-center gap-2 px-4 py-3">
                {preview.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.logo} alt="" className="h-8 w-8 rounded object-contain" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded text-xs font-bold text-white" style={{ backgroundColor: preview.color }}>{preview.name.slice(0, 1)}</div>
                )}
                <span className="text-sm font-semibold">{preview.name || "Agency name"}</span>
                {preview.header && <span className="ml-auto truncate text-xs text-text-3">{preview.header}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Agency name</Label>
            <Input id="name" name="name" required defaultValue={values.name} onChange={(e) => setPreview((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brandColor">Brand color</Label>
            <div className="flex gap-2">
              <Input id="brandColor" name="brandColor" defaultValue={values.brandColor} pattern="^#[0-9a-fA-F]{6}$" onChange={(e) => setPreview((p) => ({ ...p, color: e.target.value }))} />
              <input type="color" aria-label="Pick brand color" defaultValue={values.brandColor} onChange={(e) => { (document.getElementById("brandColor") as HTMLInputElement).value = e.target.value; setPreview((p) => ({ ...p, color: e.target.value })); }} className="h-9 w-12 cursor-pointer rounded border border-border" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="logoFile">Logo (PNG or JPEG, up to 300 KB)</Label>
            <Input
              id="logoFile"
              name="logoFile"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const u = URL.createObjectURL(f);
                setObjectUrl(u);
                setPreview((p) => ({ ...p, logo: u }));
              }}
            />
            {values.currentLogo && (
              <label className="flex items-center gap-2 text-xs text-text-2">
                <input type="checkbox" name="removeLogo" className="h-3.5 w-3.5 accent-[var(--brand)]" onChange={(e) => setPreview((p) => ({ ...p, logo: e.target.checked ? null : values.currentLogo }))} /> Remove the current logo
              </label>
            )}
          </div>
          {field("logoUrl", "…or logo URL (https)", { type: "url", placeholder: "https://…" })}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportHeader">Report header text</Label>
            <Input id="reportHeader" name="reportHeader" defaultValue={values.reportHeader} onChange={(e) => setPreview((p) => ({ ...p, header: e.target.value }))} />
          </div>
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
