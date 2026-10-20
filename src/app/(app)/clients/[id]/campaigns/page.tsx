import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { addDays, isoToDate, todayInTimeZone } from "@/lib/pacing/dates";
import { formatMoney } from "@/lib/money";
import { PlatformLabel } from "@/components/platform-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { setAllCampaignsIncludedAction, setCampaignIncludedAction, setIncludeNewCampaignsAction } from "./actions";
import { ActionButton } from "./forms";

export const dynamic = "force-dynamic";

export default async function ClientCampaignsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireClientEdit(id);
  const client = await prisma.client.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      timezone: true,
      currency: true,
      accounts: {
        orderBy: [{ platform: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, platform: true, currency: true, status: true, includeNewCampaigns: true,
          campaigns: { select: { id: true, name: true, status: true, excludedAt: true, _count: { select: { budgets: true } } } },
        },
      },
    },
  });
  const today = todayInTimeZone(client.timezone);
  const accountIds = client.accounts.map((a) => a.id);
  const spend = accountIds.length
    ? await prisma.dailyPerformance.groupBy({
        by: ["campaignId"],
        where: { accountId: { in: accountIds }, campaignId: { not: null }, date: { gte: isoToDate(addDays(today, -30)), lte: isoToDate(addDays(today, -1)) } },
        _sum: { costMinor: true },
      })
    : [];
  const spend30 = new Map(spend.map((s) => [s.campaignId!, Number(s._sum.costMinor ?? 0)]));

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <div>
        <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">Campaigns</h1>
        <p className="text-sm text-text-2">
          Choose which campaigns count for {client.name}. A removed campaign is left out of the dashboard, reports, share links, exports, budget pacing and alerts. Nothing changes in the ad account, and its data keeps syncing, so you can add it back at any time.
        </p>
      </div>
      {sp.notice && <p className="rounded-lg border border-border bg-good-bg px-4 py-3 text-sm text-good-ink" role="status">{sp.notice}</p>}
      {sp.error && <p className="rounded-lg border border-border bg-critical-bg px-4 py-3 text-sm text-critical-ink" role="alert">{sp.error}</p>}

      {client.accounts.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-text-2">
            No ad accounts are linked yet. <Link href={`/clients/${id}/accounts`} className="font-medium text-brand underline">Link an ad account</Link> and its campaigns appear here after the first sync.
          </CardContent>
        </Card>
      )}

      {client.accounts.map((a) => {
        // Included first, then by recent spend, so the campaigns that matter are on top.
        const campaigns = [...a.campaigns].sort((x, y) => Number(!!x.excludedAt) - Number(!!y.excludedAt) || (spend30.get(y.id) ?? 0) - (spend30.get(x.id) ?? 0) || x.name.localeCompare(y.name));
        const removed = campaigns.filter((c) => c.excludedAt).length;
        return (
          <Card key={a.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2"><PlatformLabel platform={a.platform} /> <span>{a.name}</span>{a.status === "DISCONNECTED" && <Badge>No longer synced</Badge>}</CardTitle>
                  <CardDescription>
                    {campaigns.length - removed} of {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} in reports
                    {" · "}New campaigns: {a.includeNewCampaigns ? "added automatically" : "start out removed"}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    action={setIncludeNewCampaignsAction.bind(null, id, a.id, !a.includeNewCampaigns)}
                    label={a.includeNewCampaigns ? "Don't add new campaigns automatically" : "Add new campaigns automatically"}
                    variant="ghost"
                  />
                  {removed > 0 && <ActionButton action={setAllCampaignsIncludedAction.bind(null, id, a.id, true)} label="Add all back" />}
                  {removed < campaigns.length && (
                    <ActionButton action={setAllCampaignsIncludedAction.bind(null, id, a.id, false)} label="Remove all" confirm={`Remove every campaign in ${a.name} from ${client.name}'s reports? Campaigns with their own budget are kept.`} />
                  )}
                </div>
              </div>
            </CardHeader>
            {campaigns.length === 0 ? (
              <CardContent className="text-sm text-text-3">No campaigns found yet. They appear after the account&apos;s next sync.</CardContent>
            ) : (
              <>
                <Table>
                  <THead>
                    <tr><TH className="pl-5">Campaign</TH><TH>Status</TH><TH className="text-right">Spend, last 30 days</TH><TH>In reports</TH><TH className="pr-5 text-right"><span className="sr-only">Action</span></TH></tr>
                  </THead>
                  <TBody>
                    {campaigns.map((c) => {
                      const budgeted = c._count.budgets > 0;
                      return (
                        <TR key={c.id} className={c.excludedAt ? "text-text-3" : undefined}>
                          <TD className="pl-5 font-medium">{c.name}</TD>
                          <TD className="text-xs">{c.status.toLowerCase()}</TD>
                          <TD className="text-right">{formatMoney(spend30.get(c.id) ?? 0, a.currency, { whole: true })}</TD>
                          <TD>{c.excludedAt ? <Badge>Removed</Badge> : <Badge variant="good">Included</Badge>}</TD>
                          <TD className="pr-5">
                            <div className="flex justify-end">
                              {c.excludedAt ? (
                                <ActionButton action={setCampaignIncludedAction.bind(null, id, c.id, true)} label="Add back" />
                              ) : (
                                <ActionButton
                                  action={setCampaignIncludedAction.bind(null, id, c.id, false)}
                                  label="Remove"
                                  variant="ghost"
                                  disabled={budgeted}
                                  title={budgeted ? "This campaign has its own budget. Delete that budget first." : undefined}
                                  confirm={`Remove ${c.name} from ${client.name}'s reports? You can add it back later.`}
                                />
                              )}
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
                <div className="h-4" />
              </>
            )}
          </Card>
        );
      })}
      <p className="text-xs text-text-3">New campaigns created in the ad platform show up here after the next sync (hourly). Marketing Nexus only reads reporting data; to create or delete a campaign itself, use the ad platform.</p>
    </div>
  );
}
