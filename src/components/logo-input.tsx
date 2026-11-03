"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const MAX_SIDE = 256;
const MAX_CHARS = 350_000;

/** Reads an image file and returns a PNG (or JPEG, if large) data URL no bigger than 256 px a side. */
export async function resizeLogo(file: File): Promise<string> {
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

/**
 * Logo upload (resized to 256 px and stored inline) or an https URL, posted
 * as a hidden `name` field. Controlled, so a preview can follow it.
 */
export function LogoInput({ id, name, value, onChange, label = "Logo" }: { id: string; name: string; value: string; onChange: (v: string) => void; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const isData = value.startsWith("data:");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={file}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError(null);
            try {
              onChange("");
              onChange(await resizeLogo(f));
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}><ImageUp className="h-4 w-4" aria-hidden /> Upload image</Button>
        {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}><Trash2 className="h-4 w-4" aria-hidden /> Remove</Button>}
        <span className="text-xs text-text-3">PNG, JPEG, WebP or SVG; resized to 256 px.</span>
      </div>
      {!isData && (
        <Input aria-label={`Or paste a ${label.toLowerCase()} URL (https)`} type="url" placeholder="…or paste an https:// logo URL" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      )}
      {error && <p className="text-xs text-critical-ink" role="alert">{error}</p>}
    </div>
  );
}
