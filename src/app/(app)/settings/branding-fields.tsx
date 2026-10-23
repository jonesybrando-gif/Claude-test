"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const MAX_SIDE = 256;
const MAX_CHARS = 350_000;

/** Reads an image file and returns a PNG (or JPEG, if large) data URL no bigger than 256 px a side. */
async function toDataUrl(file: File): Promise<string> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read."));
      i.src = src;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || MAX_SIDE, img.naturalHeight || MAX_SIDE));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || MAX_SIDE) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || MAX_SIDE) * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    let url = canvas.toDataURL("image/png");
    if (url.length > MAX_CHARS) url = canvas.toDataURL("image/jpeg", 0.85);
    if (url.length > MAX_CHARS) throw new Error("That image is too detailed; try a simpler or smaller logo.");
    return url;
  } finally {
    URL.revokeObjectURL(src);
  }
}

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
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof BrandingValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const validColor = /^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : "#4f46e5";
  const isData = v.logoUrl.startsWith("data:");

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
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="logo-file">Logo</Label>
          <input type="hidden" name="logoUrl" value={v.logoUrl} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={file}
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setError(null);
                try {
                  setV((p) => ({ ...p, logoUrl: "" }));
                  const url = await toDataUrl(f);
                  setV((p) => ({ ...p, logoUrl: url }));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}><ImageUp className="h-4 w-4" aria-hidden /> Upload image</Button>
            {v.logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setV((p) => ({ ...p, logoUrl: "" }))}><Trash2 className="h-4 w-4" aria-hidden /> Remove</Button>}
            <span className="text-xs text-text-3">PNG, JPEG, WebP or SVG; resized to 256 px. Saved with the settings.</span>
          </div>
          {!isData && (
            <Input aria-label="Or paste a logo URL (https)" type="url" placeholder="…or paste an https:// logo URL" value={v.logoUrl} onChange={set("logoUrl")} className="mt-1" />
          )}
          {error && <p className="text-xs text-critical-ink" role="alert">{error}</p>}
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
        <figcaption className="text-xs font-medium text-text-3">Preview: shared client report</figcaption>
        <div className="overflow-hidden rounded-lg border border-border bg-background text-text" style={{ ["--brand" as string]: validColor }}>
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
            {v.reportHeader && <span className="truncate text-[10px] text-text-2">{v.reportHeader}</span>}
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
            <span className="self-start rounded-md bg-brand px-2 py-1 text-[10px] font-medium text-brand-ink">Download PDF</span>
            {v.reportFooter && <p className="border-t border-border pt-2 text-[10px] text-text-3">{v.reportFooter}</p>}
          </div>
        </div>
      </figure>
    </div>
  );
}
