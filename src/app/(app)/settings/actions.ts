"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { validateThresholds } from "@/lib/pacing/status";

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
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  const f = parsed.data;
  try {
    validateThresholds(f);
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
  await prisma.agency.update({
    where: { id: user.agencyId },
    data: {
      name: f.name,
      brandColor: f.brandColor,
      logoUrl: f.logoUrl || null,
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
