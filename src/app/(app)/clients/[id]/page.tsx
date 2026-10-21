import Link from "next/link";
import { Download, FileSliders, FileText, Link2, ListChecks, Mail, Plug, Settings2, Share2, Wrench } from "lucide-react";
import { AiSuggestionsCard } from "@/components/ai/suggestions-card";
import { requireClientView } from "@/server/access";
import { loadClientReport } from "@/server/client-report";
import { STALE_AFTER_MS } from "@/server/pacing-service";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate, relativeTime } from "@/lib/time";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DemoBadge } from "@/components/status-badge";
import { RangeControls } from "@/components/range-controls";
import { ExportButtons } from "@/components/export-buttons";
import { Menu } from "@/components/menu";
import { ClientReportView, type ReportTab } from "@/components/reports/client-report-view";

export const dynamic = "force-dynamic";

const TABS: { key: ReportTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campaigns" },
  { key: "trends", label: "Trends" },
  { key: "insights", label: "Insights" },
];

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClientView(id);
  const staff = user.role !== "CLIENT_USER";

  const rep = await loadClientReport(id, sp);
  const { client, preset, compareMode, range, cmpRange, pacing } = rep;
  const isDemo = client.accounts.some((a) => a.isDemo);
  const tab: ReportTab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as ReportTab) : "overview";

  // Keeps the date range (and nothing tab-specific) when switching tabs or opening menus.
  const rangeQs = new URLSearchParams(Object.entries({ range: sp.range, compare: sp.compare, from: sp.from, to: sp.to }).filter((e): e is [string, string] => !!e[1])).toString();
  const tabHref = (t: ReportTab) => `/clients/${id}?${[rangeQs, t === "overview" ? "" : `tab=${t}`].filter(Boolean).join("&")}`;
  const exportHref = (kind: string, extra = "") => `/api/reports/clients/${id}/${kind}${rangeQs || extra ? `?${[rangeQs, extra].filter(Boolean).join("&")}` : ""}`;

  // Data freshness: limited by the account that synced longest ago.
  const live = client.accounts.filter((a) => !a.isDemo && a.status !== "DISCONNECTED");
  const syncs = live.map((a) => a.lastSuccessfulSyncAt?.toISOString() ?? null);
  const oldestSync = syncs.includes(null) ? null : syncs.sort()[0] ?? null;
  const complete = pacing.accounts.filter((a) => live.some((l) => l.id === a.id)).map((a) => a.dataCompleteThrough).filter((d): d is string => !!d).sort()[0];
  const failing = live.some((a) => a.status === "NEEDS_REAUTH" || a.syncRuns[0]?.status === "FAILED");
  const stale = live.length > 0 && (!oldestSync || Date.now() - Date.parse(oldestSync) > STALE_AFTER_MS);
  const noAccounts = client.accounts.filter((a) => a.status !== "DISCONNECTED").length === 0;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      {/* Stays in view while scrolling, so the date range is always at hand. */}
      <div className="z-20 -mx-4 md:sticky md:top-0 flex flex-col gap-3 border-b border-border bg-background/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{client.name}</h1>
              {isDemo && <DemoBadge />}
            </div>
            <p className="text-sm text-text-2">
              {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
              {cmpRange && <> · vs {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
              {pacing.client.managerName && staff && <> · {pacing.client.managerName}</>}
            </p>
            {live.length > 0 && (
              <p className={`text-xs ${failing || stale ? "text-warning-ink" : "text-text-3"}`}>
                {failing ? "Sync problem: check Ad accounts · " : stale ? "Data may be out of date · " : ""}
                Synced {oldestSync ? relativeTime(oldestSync).toLowerCase() : "never"}
                {complete && <> · complete through {formatDate(complete)}</>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
            {staff ? (
              <>
                <Menu
                  primary
                  label="Share report"
                  icon={<Share2 className="h-4 w-4" aria-hidden />}
                  items={[
                    { label: "Share link", href: `/clients/${id}/share`, description: "A private web link the client can open", icon: <Link2 className="h-4 w-4" /> },
                    { label: "Email client", href: `/clients/${id}/email`, description: "Draft an email with the AI, then send", icon: <Mail className="h-4 w-4" /> },
                    { label: "PDF", href: exportHref("pdf"), download: true, description: "The client-facing report", icon: <FileText className="h-4 w-4" /> },
                    { label: "PDF + notes", href: exportHref("pdf", "internal=1"), download: true, description: "Includes internal recommendations", icon: <FileText className="h-4 w-4" /> },
                    { label: "CSV", href: exportHref("csv"), download: true, description: "Daily rows by campaign", icon: <Download className="h-4 w-4" /> },
                  ]}
                />
                <Menu
                  label="Setup"
                  icon={<Wrench className="h-4 w-4" aria-hidden />}
                  items={[
                    { label: "Ad accounts", href: `/clients/${id}/accounts`, icon: <Plug className="h-4 w-4" /> },
                    { label: "Campaigns", href: `/clients/${id}/campaigns?range=${preset}&from=${range.from}&to=${range.to}`, description: "Choose which campaigns count", icon: <ListChecks className="h-4 w-4" /> },
                    { label: "Budgets", href: `/clients/${id}/budgets`, icon: <Settings2 className="h-4 w-4" /> },
                    { label: "Customize report", href: `/clients/${id}/report`, description: "What the client sees", icon: <FileSliders className="h-4 w-4" /> },
                  ]}
                />
              </>
            ) : (
              <ExportButtons base={`/api/reports/clients/${id}`} query={sp} />
            )}
          </div>
        </div>
        {staff && (
          <nav className="-mb-3 flex gap-1 overflow-x-auto" aria-label="Client sections">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={tabHref(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-brand font-medium text-text" : "border-transparent text-text-2 hover:text-text"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {staff && noAccounts && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div>
              <p className="font-medium">No ad accounts linked yet</p>
              <p className="text-sm text-text-2">Link {client.name}&apos;s Google Ads, Meta or Microsoft account to start reporting and pacing.</p>
            </div>
            <Link href={`/clients/${id}/accounts`} className={buttonVariants()}><Plug className="h-4 w-4" /> Link an ad account</Link>
          </CardContent>
        </Card>
      )}

      <ClientReportView
        rep={rep}
        staff={staff}
        basePath={`/clients/${id}`}
        query={sp}
        tab={staff ? tab : undefined}
        tabHref={tabHref}
        afterKpis={staff ? <AiSuggestionsCard clientId={id} query={sp} /> : null}
      />
    </div>
  );
}
