import { prisma } from "@/server/db";
import { visibleClientsWhere } from "@/server/access";
import { copyBannerState } from "@/server/budget-rollover";
import { monthName } from "@/lib/budget-rollover";
import type { SessionUser } from "@/lib/access";
import { BudgetRolloverButton } from "./budget-rollover-button";
import { Banner } from "../ui/banner";

/**
 * From the 25th: "Copy October budgets to November (n clients)". Hidden when
 * every client with budgets this month already has next month's, and for
 * client logins. Never breaks the page it sits on.
 */
export async function BudgetRolloverBanner({ user }: { user: SessionUser }) {
  if (user.role === "CLIENT_USER") return null;
  let state: Awaited<ReturnType<typeof copyBannerState>> = null;
  try {
    const agency = await prisma.agency.findUnique({ where: { id: user.agencyId }, select: { defaultTimezone: true } });
    state = await copyBannerState(visibleClientsWhere(user), agency?.defaultTimezone ?? "UTC");
  } catch (e) {
    console.error("[budget-rollover] banner failed", e);
  }
  if (!state) return null;
  const from = monthName(state.fromMonth);
  const to = monthName(state.toMonth);
  return (
    <Banner tone="info" action={<BudgetRolloverButton from={from} to={to} clients={state.clients} />}>
      <span className="font-medium">{to} budgets aren&apos;t set for {state.clients} client{state.clients === 1 ? "" : "s"} yet.</span>{" "}
      <span className="text-text-2">Copy {from}&apos;s amounts and settings; you can change any of them afterwards.</span>
    </Banner>
  );
}
