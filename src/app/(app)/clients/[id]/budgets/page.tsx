import Link from "next/link";
import { clientBackHref } from "@/lib/client-nav";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { addDays, dateToIso, isoToDate, maxDate, minDate, monthBounds, todayInTimeZone } from "@/lib/pacing/dates";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { PLATFORM_LABEL } from "@/lib/platforms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteBudgetButton, NewBudgetForm, ReviseBudgetForm } from "./forms";

export const dynamic = "force-dynamic";

const DIST_LABEL = { EVEN: "Even", BUSINESS_DAYS: "Business days", WEEKEND_WEIGHTED: "Weekend-weighted", CUSTOM_WEEKDAY: "Custom weekday", CUSTOM_DAILY: "Custom daily" } as const;

export default async function BudgetsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const back = clientBackHref(id, await searchParams, "setup");
  await requireClientEdit(id);
  const client = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: { accounts: { include: { campaigns: { where: { excludedAt: null } } } } },
  });
  const today = todayInTimeZone(client.timezone);
  const month = monthBounds(today);
  const budgets = await prisma.budget.findMany({
    where: { clientId: id, periodEnd: { gte: isoToDate(addDays(month.start, -62)) } },
    include: { revisions: { orderBy: { effectiveDate: "asc" }, include: { createdBy: { select: { name: true } } } }, account: true, campaign: true },
    orderBy: [{ periodStart: "desc" }, { scope: "asc" }],
  });
  const accounts = client.accounts.map((a) => ({ id: a.id, label: `${PLATFORM_LABEL[a.platform]} · ${a.name}` }));
  const campaigns = client.accounts.flatMap((a) => a.campaigns.map((c) => ({ id: c.id, label: `${PLATFORM_LABEL[a.platform]} · ${c.name}` })));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div>
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">Budgets</h1>
        <p className="text-sm text-text-2">Budgets entered here drive pacing only. They never change budgets inside Google, Meta or Microsoft.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a budget</CardTitle>
          <CardDescription>
            Use a combined client budget to pace all platforms together, account budgets per platform, or campaign budgets. Budgets at a lower level beneath a higher one are treated as sub-allocations and are not double-counted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewBudgetForm clientId={id} accounts={accounts} campaigns={campaigns} defaultStart={month.start} defaultEnd={month.end} />
        </CardContent>
      </Card>

      {budgets.map((b) => {
        const start = dateToIso(b.periodStart);
        const end = dateToIso(b.periodEnd);
        const current = b.revisions.at(-1)!;
        const target = b.scope === "CLIENT" ? "Combined client budget" : b.scope === "ACCOUNT" ? `${PLATFORM_LABEL[b.account!.platform]} · ${b.account!.name}` : `Campaign · ${b.campaign!.name}`;
        const active = start <= today && today <= end;
        return (
          <Card key={b.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>{target}</CardTitle>
                  <CardDescription>
                    {formatDate(start, { month: "short", day: "numeric", year: "numeric" })} – {formatDate(end, { month: "short", day: "numeric", year: "numeric" })}
                    {active && " · current period"} · {DIST_LABEL[b.distribution]} distribution{b.weekendWeight && ` (weekend ×${Number(b.weekendWeight)})`} · {b.forecastModel === "STRAIGHT_LINE" ? "straight-line forecast" : "7-day trend forecast"}
                    {Array.isArray(b.pauses) && (b.pauses as { start: string; end: string }[]).map((p) => ` · paused ${formatDate(p.start)}–${formatDate(p.end)}`)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular">{formatMoney(Number(current.amountMinor), b.currency)}</span>
                  <DeleteBudgetButton clientId={id} budgetId={b.id} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="flex flex-col gap-1 text-xs text-text-2">
                {b.revisions.map((r, i) => (
                  <li key={r.id} className="tabular">
                    <span className="font-medium text-text">{formatMoney(Number(r.amountMinor), b.currency)}</span> effective {formatDate(dateToIso(r.effectiveDate))}
                    {i > 0 && " (mid-period change — the remaining budget is re-spread over the remaining days)"}
                    {r.note && ` · ${r.note}`}
                    {r.createdBy && ` · by ${r.createdBy.name}`}
                  </li>
                ))}
              </ol>
              {end >= today && <ReviseBudgetForm clientId={id} budgetId={b.id} defaultDate={maxDate(start, minDate(today, end))} min={start} max={end} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
