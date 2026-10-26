import { prisma } from "@/server/db";
import { visibleClientsWhere } from "@/server/access";
import { copyBannerState } from "@/server/budget-rollover";
import { monthName } from "@/lib/budget-rollover";
import type { SessionUser } from "@/lib/access";
import { BudgetRolloverButton } from "./budget-rollover-button";

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
    <section aria-label={`${to} budgets`} className="flex flex-col gap-3 rounded-xl border border-border bg-info-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-medium text-text">{to} starts soon</p>
        <p className="text-text-2">
          {state.clients} client{state.clients === 1 ? " has" : "s have"} {from} budgets but nothing set for {to} yet. Copy them with the same amounts and settings; you can change any of them afterwards.
        </p>
      </div>
      <BudgetRolloverButton from={from} to={to} clients={state.clients} />
    </section>
  );
}
