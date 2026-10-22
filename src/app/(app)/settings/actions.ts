"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { validateThresholds } from "@/lib/pacing/status";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/logo";

export type SettingsState = { ok?: string; errors?: string[] } | undefined;

const num = z.coerce.number().finite();
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Brand color must be a hex color like #4f46e5"),
  logoUrl: z.string().url("Logo must be an https URL").startsWith("https://", "Logo must be an https URL").or(z.literal("")),
  reportHeader: z.string().max(500).optional(),
  reportFooter: z.string().max(500).optional(),
  under: num,
  slightlyUnder: num,
  slightlyOver: num,
  over: num,
});

export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const f = parsed.data;
  try {
    validateThresholds(f);
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
  // Logo: an uploaded PNG/JPEG is stored with the agency (no external hosting needed).
  let logoData: string | null | undefined;
  const file = form.get("logoFile");
  if (form.get("removeLogo") === "on") logoData = null;
  else if (file instanceof File && file.size > 0) {
    if (!LOGO_TYPES.includes(file.type)) return { errors: ["Upload the logo as a PNG or JPEG."] };
    if (file.size > LOGO_MAX_BYTES) return { errors: ["The logo must be 300 KB or smaller."] };
    logoData = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  }
  await prisma.agency.update({
    where: { id: user.agencyId },
    data: {
      ...(logoData !== undefined ? { logoData } : {}),
      ...(form.get("removeLogo") === "on" ? { logoUrl: null } : {}),
      name: f.name,
      brandColor: f.brandColor,
      ...(form.get("removeLogo") === "on" ? {} : { logoUrl: f.logoUrl || null }),
      reportHeader: f.reportHeader || null,
      reportFooter: f.reportFooter || null,
      thresholdUnder: f.under,
      thresholdSlightlyUnder: f.slightlyUnder,
      thresholdSlightlyOver: f.slightlyOver,
      thresholdOver: f.over,
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
