"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyStaff, visibleClientsWhere } from "@/server/access";
import { copyBudgetsToNextMonth } from "@/server/budget-rollover";

export type CopyResult = { ok: true; clients: number } | { ok: false; error: string };

/** "Copy October budgets to November": every whole-month budget the user can edit. */
export async function copyBudgetsToNextMonthAction(): Promise<CopyResult> {
  const user = await requireAgencyStaff(); // staff can edit every client they can see
  try {
    const r = await copyBudgetsToNextMonth(visibleClientsWhere(user), user.id);
    revalidatePath("/dashboard");
    revalidatePath("/clients", "layout");
    return { ok: true, clients: r.clients };
  } catch (e) {
    console.error("[budget-rollover] copy failed", e);
    return { ok: false, error: "The budgets couldn't be copied. Try again in a moment." };
  }
}
