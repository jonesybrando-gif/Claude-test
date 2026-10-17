"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/access";
import { resolveAlertSettings, validateAlertSettings, type AlertSettings } from "@/lib/alerts";
import { parseMoneyToMinor } from "@/lib/money";

export type AlertSettingsState = { ok?: string; errors?: string[] } | undefined;

export async function saveAlertSettings(_prev: AlertSettingsState, form: FormData): Promise<AlertSettingsState> {
  const admin = await requireAdmin();
  const num = (k: string) => Number(String(form.get(k) ?? "").trim());
  let spikeMin: number, stoppedMin: number;
  try {
    spikeMin = parseMoneyToMinor(String(form.get("spikeMinDaily") ?? "0"));
    stoppedMin = parseMoneyToMinor(String(form.get("stoppedMinDaily") ?? "0"));
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
  const s: AlertSettings = resolveAlertSettings({
    overrunPct: num("overrunPct"),
    spikeMultiplier: num("spikeMultiplier"),
    spikeMinDailyMinor: spikeMin,
    stoppedDays: num("stoppedDays"),
    stoppedMinDailyMinor: stoppedMin,
    campaignNoSpendDays: num("campaignNoSpendDays"),
    staleHours: num("staleHours"),
  });
  const problems = validateAlertSettings(s);
  if (problems.length) return { errors: problems };
  await prisma.agency.update({ where: { id: admin.agencyId }, data: { alertSettings: { ...s } } });
  revalidatePath("/settings/alerts");
  return { ok: "Saved. New thresholds apply from the next check." };
}
