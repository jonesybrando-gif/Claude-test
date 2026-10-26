import Link from "next/link";
import { clientBackHref } from "@/lib/client-nav";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { agencyDataForSeoConnection, dataForSeoBalance, formatUsd } from "@/server/data-sources/dataforseo/account";
import { activeKeywordTexts, clientRankProject } from "@/server/data-sources/dataforseo/projects";
import { keywordRankTable, type KeywordRankRow } from "@/server/metrics/rankings";
import { COST_PER_CHECK_USD, DEFAULT_LOCATION_CODE, locationName, rankCostEstimate, readRankSettings } from "@/lib/rankings";
import { relativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Sparkline } from "@/components/kpi/sparkline";
import { ActionButton } from "@/components/action-button";
import { removeKeyword, setRankProjectPaused } from "./actions";
import { AddKeywordsForm, RankProjectForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keyword rankings" };

const FEATURE_LABEL: Record<string, string> = {
  local_pack: "Local pack", map: "Map", people_also_ask: "People also ask", featured_snippet: "Featured snippet", ai_overview: "AI overview",
  images: "Images", video: "Videos", top_stories: "Top stories", knowledge_graph: "Knowledge panel", paid: "Ads", shopping: "Shopping",
  related_searches: "Related searches", twitter: "X posts", discussions_and_forums: "Forums", perspectives: "Perspectives", answer_box: "Answer box",
};
const SKIP_FEATURES = new Set(["organic", "related_searches", "people_also_search"]);

function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="text-text-3">—</span>;
  if (v === 0) return <span className="text-text-3">0</span>;
  const up = v < 0; // lower position = better
  return <span className={up ? "text-good-ink" : "text-critical-ink"}>{up ? "▲" : "▼"} {Math.abs(v)}</span>;
}

function shortUrl(u: string) {
  try {
    const x = new URL(u);
    return (x.pathname + x.search).replace(/\/$/, "") || "/";
  } catch {
    return u;
  }
}

function RankTable({ rows, clientId, showDevice }: { rows: KeywordRankRow[]; clientId: string; showDevice: boolean }) {
  return (
    <>
    {/* Phones: one card per keyword instead of a nine-column table. */}
    <ul className="flex flex-col gap-2 md:hidden" aria-label="Keyword positions">
      {rows.map((r, i) => {
        const firstOfKeyword = rows.findIndex((x) => x.keyword === r.keyword) === i;
        const features = r.serpFeatures.filter((f) => !SKIP_FEATURES.has(f));
        return (
          <li key={r.keywordId} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-sm">
                <span className="font-medium">{r.keyword}</span>
                {showDevice && <Badge variant="neutral" className="ml-2">{r.device}</Badge>}
                {!r.checkedOn && <span className="block text-xs text-text-3">waiting for first check</span>}
              </p>
              <p className="shrink-0 text-right text-lg font-semibold tabular">
                <span className="sr-only">Position </span>
                {r.position ?? (r.checkedOn ? <span className="text-sm font-normal text-text-3">&gt;100</span> : "—")}
                {r.newlyRanked && <Badge variant="good" className="ml-1">new</Badge>}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-text-3">7 days</dt><dd className="font-medium tabular"><Change v={r.change7} /></dd></div>
              <div><dt className="text-text-3">30 days</dt><dd className="font-medium tabular"><Change v={r.change30} /></dd></div>
              <div><dt className="text-text-3">Best</dt><dd className="font-medium tabular">{r.best ?? "—"}</dd></div>
            </dl>
            {r.url && <p className="mt-2 truncate text-xs"><a href={r.url} target="_blank" rel="noreferrer noopener" className="text-brand hover:underline" title={r.url}>{shortUrl(r.url)}</a></p>}
            {features.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {features.slice(0, 4).map((f) => <Badge key={f} variant="neutral">{FEATURE_LABEL[f] ?? f.replace(/_/g, " ")}</Badge>)}
                {features.length > 4 && <span className="text-xs text-text-3">+{features.length - 4}</span>}
              </div>
            )}
            {firstOfKeyword && (
              <div className="mt-2 flex justify-end">
                <ActionButton action={removeKeyword.bind(null, clientId, r.keyword)} label="Remove" variant="ghost" title="Stop tracking and delete this keyword's history" />
              </div>
            )}
          </li>
        );
      })}
    </ul>
    <div className="hidden md:block">
    <Table>
      <THead>
        <TR>
          <TH>Keyword</TH>
          <TH className="text-right">Position</TH>
          <TH className="text-right">7 days</TH>
          <TH className="text-right">30 days</TH>
          <TH className="text-right">Best</TH>
          <TH>Ranking URL</TH>
          <TH>Last 30 days</TH>
          <TH>SERP features</TH>
          <TH><span className="sr-only">Actions</span></TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => {
          const firstOfKeyword = rows.findIndex((x) => x.keyword === r.keyword) === i;
          const features = r.serpFeatures.filter((f) => !SKIP_FEATURES.has(f));
          return (
            <TR key={r.keywordId}>
              <TD className="max-w-[260px] whitespace-normal">
                <span className="font-medium">{r.keyword}</span>
                {showDevice && <Badge variant="neutral" className="ml-2">{r.device}</Badge>}
                {!r.checkedOn && <span className="ml-2 text-xs text-text-3">waiting for first check</span>}
              </TD>
              <TD className="text-right font-semibold">{r.position ?? (r.checkedOn ? <span className="font-normal text-text-3">&gt;100</span> : "—")}{r.newlyRanked && <Badge variant="good" className="ml-1">new</Badge>}</TD>
              <TD className="text-right"><Change v={r.change7} /></TD>
              <TD className="text-right"><Change v={r.change30} /></TD>
              <TD className="text-right">{r.best ?? "—"}</TD>
              <TD className="max-w-[240px] truncate">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-brand hover:underline" title={r.url}>{shortUrl(r.url)}</a> : <span className="text-text-3">—</span>}
              </TD>
              <TD><Sparkline values={r.history.map((h) => (h.position === null ? null : -h.position))} width={90} height={24} /></TD>
              <TD className="max-w-[260px] whitespace-normal">
                <div className="flex flex-wrap gap-1">
                  {features.slice(0, 4).map((f) => <Badge key={f} variant="neutral">{FEATURE_LABEL[f] ?? f.replace(/_/g, " ")}</Badge>)}
                  {features.length > 4 && <span className="text-xs text-text-3" title={features.join(", ")}>+{features.length - 4}</span>}
                </div>
              </TD>
              <TD className="text-right">
                {firstOfKeyword && <ActionButton action={removeKeyword.bind(null, clientId, r.keyword)} label="Remove" variant="ghost" title="Stop tracking and delete this keyword's history" />}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
    </div>
    </>
  );
}

export default async function RankingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const back = clientBackHref(id, await searchParams, "setup");
  const user = await requireClientEdit(id);
  const [client, connection, asset] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true } }),
    agencyDataForSeoConnection(user.agencyId),
    clientRankProject(id),
  ]);
  const [rows, keywords, { balance, error: balanceError }] = await Promise.all([
    asset ? keywordRankTable(id, { days: 30 }) : Promise.resolve([] as KeywordRankRow[]),
    asset ? activeKeywordTexts(asset.id) : Promise.resolve([] as string[]),
    dataForSeoBalance(connection),
  ]);
  const settings = readRankSettings(asset?.settings);
  const cost = rankCostEstimate(keywords.length, settings.device);
  const paused = asset?.status === "DISCONNECTED";
  const lastRunAt = asset?.settings && typeof asset.settings === "object" && "lastRunAt" in asset.settings ? String((asset.settings as Record<string, unknown>).lastRunAt) : null;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div>
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">Keyword rankings</h1>
        <p className="text-sm text-text-2">
          Exact Google organic positions for {client.name}&apos;s keywords, checked once a day (top 100 results) through DataForSEO.
          Add the “Keyword rankings” dashboard template to show them to the client.
        </p>
      </div>

      {!connection ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect DataForSEO first</CardTitle>
            <CardDescription>Rank checks run on your agency&apos;s DataForSEO account. {user.role === "AGENCY_ADMIN" ? "Add the API login on the Integrations page." : "Ask an administrator to connect it on the Integrations page."}</CardDescription>
          </CardHeader>
          {user.role === "AGENCY_ADMIN" && <CardContent><Link href="/integrations" className={buttonVariants({ size: "sm" })}>Open Integrations</Link></CardContent>}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{asset ? "Tracking settings" : "Set up rank tracking"}</CardTitle>
                <CardDescription>
                  {asset
                    ? <>Tracking <span className="font-medium text-text">{asset.externalId}</span> in {locationName(settings.locationCode)} on {settings.device === "both" ? "desktop and mobile" : settings.device}.{" "}
                      {paused ? "Paused." : <>Last check {relativeTime(asset.lastSuccessfulSyncAt?.toISOString() ?? lastRunAt)}{settings.pendingTasks.length > 0 && <> · {settings.pendingTasks.length} check{settings.pendingTasks.length === 1 ? "" : "s"} in progress</>}.</>}</>
                    : "Choose the site and the searcher's location. Changing the location or device later starts fresh history for that combination."}
                </CardDescription>
              </div>
              {asset && <ActionButton action={setRankProjectPaused.bind(null, id, !paused)} label={paused ? "Resume checks" : "Pause checks"} variant="outline" />}
            </div>
            {asset?.lastError && <p className="mt-1 text-xs text-critical-ink" role="alert">{asset.lastError}</p>}
            {connection.status !== "ACTIVE" && <p className="mt-1 text-xs text-critical-ink">The agency&apos;s DataForSEO login needs reconnecting on the Integrations page.</p>}
          </CardHeader>
          <CardContent>
            <RankProjectForm clientId={id} domain={asset?.externalId} locationCode={asset ? settings.locationCode : DEFAULT_LOCATION_CODE} device={settings.device} isNew={!asset} />
          </CardContent>
        </Card>
      )}

      {asset && (
        <>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader><CardTitle>Keywords</CardTitle></CardHeader>
              <CardContent><AddKeywordsForm clientId={id} tracked={keywords.length} /></CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Estimated cost</CardTitle>
                <CardDescription>Standard queue, about {formatUsd(COST_PER_CHECK_USD, 4)} per check. DataForSEO bills your agency&apos;s account directly; deeper or extra pages may cost more.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>{keywords.length} keyword{keywords.length === 1 ? "" : "s"} × {settings.device === "both" ? 2 : 1} device{settings.device === "both" ? "s" : ""} = <span className="font-semibold">{cost.checksPerDay}</span> checks a day</p>
                <p>About <span className="font-semibold tabular">{formatUsd(cost.perDay, 3)}</span> a day, <span className="font-semibold tabular">{formatUsd(cost.perMonth)}</span> a month</p>
                <p className="text-text-2">
                  Agency balance: <span className={`font-semibold tabular ${balance !== null && balance < 1 ? "text-critical-ink" : "text-text"}`}>{formatUsd(balance)}</span>
                  {balance !== null && cost.perDay > 0 && <> · covers this client for about {Math.floor(balance / cost.perDay).toLocaleString("en-US")} days</>}
                </p>
                {balanceError && <p className="text-xs text-warning-ink">Couldn&apos;t read the balance: {balanceError}</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Positions</CardTitle>
              <CardDescription>Latest check per keyword. Changes compare with 7 and 30 days earlier; ▲ means it moved up. “&gt;100” means the site isn&apos;t in the top 100.</CardDescription>
              {settings.taskErrors.length > 0 && (
                <details className="mt-1 text-xs text-warning-ink">
                  <summary className="cursor-pointer">{settings.taskErrors.length} keyword check{settings.taskErrors.length === 1 ? "" : "s"} failed on the last run (retried automatically)</summary>
                  <ul className="mt-1 list-disc pl-5">{settings.taskErrors.map((e, i) => <li key={i}>{e.keyword}: {e.message}</li>)}</ul>
                </details>
              )}
            </CardHeader>
            <CardContent>
              {rows.length ? <RankTable rows={rows} clientId={id} showDevice={settings.device === "both"} /> : <p className="text-sm text-text-2">No keywords yet. Add some above.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
