import { z } from "zod";

// Logos (the agency's and each client's) are stored as an https URL or as an
// uploaded image inline: a PNG or JPEG data URL, resized in the browser to
// 256 px a side (see resizeLogo in src/components/logo-input.tsx).

/** Largest stored data URL, in characters. */
export const LOGO_MAX_CHARS = 400_000;

/** An https URL, an inline PNG/JPEG data URL, or "" for none. */
export const logoUrlSchema = z
  .string()
  .url("Logo must be an https URL")
  .startsWith("https://", "Logo must be an https URL")
  .or(z.string().max(LOGO_MAX_CHARS, "That logo image is too large.").regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "Upload the logo as a PNG or JPEG image."))
  .or(z.literal(""));

/** Up to two initials for a name, for when there's no logo ("Polished Dentistry" → "PD"). */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(and|&|the|of|llc|inc|co)$/i.test(w));
  const letters = (words.length ? words : [name]).slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join("") || "?";
}
