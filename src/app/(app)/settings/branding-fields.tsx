"use client";

import { useState } from "react";
import { LogoInput } from "@/components/logo-input";
import { Input, Label } from "@/components/ui/input";
import { brandStyle, contrastRatio } from "@/lib/brand-color";

export interface BrandingValues {
  name: string;
  brandColor: string;
  logoUrl: string;
  reportHeader: string;
  reportFooter: string;
}

/** Branding inputs with a logo upload and a live preview of the client report header. */
export function BrandingFields({ values }: { values: BrandingValues }) {
  const [v, setV] = useState(values);
  const set = (k: keyof BrandingValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const validColor = /^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : "#4f46e5";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Agency name</Label>
          <Input id="name" name="name" required value={v.name} onChange={set("name")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brandColor">Brand color</Label>
          <div className="flex gap-2">
            <Input id="brandColor" name="brandColor" value={v.brandColor} onChange={set("brandColor")} pattern="^#[0-9a-fA-F]{6}$" />
            <input type="color" aria-label="Pick brand color" value={validColor} onChange={set("brandColor")} className="h-9 w-12 cursor-pointer rounded border border-border" />
          </div>
          {contrastRatio(validColor, "#ffffff") < 3 && (
            <p className="text-xs text-warning-ink" role="status">
              This colour is very light, so it is hard to see on a white page (contrast {contrastRatio(validColor, "#ffffff").toFixed(1)}:1; 3:1 or more is recommended). Buttons will use dark text automatically, but thin lines and accents in this colour may be hard to see.
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <LogoInput id="logo-file" name="logoUrl" value={v.logoUrl} onChange={(logoUrl) => setV((p) => ({ ...p, logoUrl }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reportHeader">Report header text</Label>
          <Input id="reportHeader" name="reportHeader" value={v.reportHeader} onChange={set("reportHeader")} maxLength={500} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reportFooter">Report footer text</Label>
          <Input id="reportFooter" name="reportFooter" value={v.reportFooter} onChange={set("reportFooter")} maxLength={500} />
        </div>
      </div>

      <figure className="flex flex-col gap-2" aria-label="Preview">
        <figcaption className="text-xs font-medium text-text-3">Preview: your logo and colour (client reports show the client&apos;s own logo, set on each client&apos;s Customize report page)</figcaption>
        <div className="overflow-hidden rounded-lg border border-border bg-background text-text" style={brandStyle(validColor)}>
          <div className="h-1.5 bg-brand" />
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              {v.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-xs font-bold text-brand-ink">{(v.name || "A").slice(0, 1)}</div>
              )}
              <span className="truncate text-xs font-semibold">{v.name || "Your agency"}</span>
            </div>
            {v.reportHeader && <span className="truncate text-xs text-text-2">{v.reportHeader}</span>}
          </div>
          <div className="flex flex-col gap-2 px-3 py-3">
            <p className="text-sm font-semibold">Client name</p>
            <div className="grid grid-cols-3 gap-1.5">
              {["Spend", "Conv.", "CPA"].map((k) => (
                <div key={k} className="rounded-md border border-border bg-surface px-2 py-1.5">
                  <p className="text-[9px] text-text-3">{k}</p>
                  <p className="text-xs font-semibold">—</p>
                </div>
              ))}
            </div>
            <span className="self-start rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-ink">Download PDF</span>
            {v.reportFooter && <p className="border-t border-border pt-2 text-xs text-text-3">{v.reportFooter}</p>}
          </div>
        </div>
      </figure>
    </div>
  );
}
