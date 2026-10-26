import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, ChevronRight, Sparkles, StickyNote, Download, Database, FileSliders, FileText, Link2, ListChecks, Mail, Plug, Search, Share2, Wallet } from "lucide-react";
import { AiSuggestionsCard } from "@/components/ai/suggestions-card";
import { requireClientView, userCanEditClient, visibleClientsWhere } from "@/server/access";
import { withRememberedRange } from "@/server/remembered-range";
import { shortRangeLabel, withReportQuery } from "@/lib/client-nav";
import { ClientSwitcher } from "@/components/client-switcher";
import { prisma } from "@/server/db";
import { completeClientReport, loadClientReportHead, type ClientReport } from "@/server/client-report";
import { rangeLabel } from "@/lib/date-ranges";
import { ClientAlertsStrip } from "@/components/alerts/client-alerts-strip";
import { formatDate } from "@/lib/time";
import { DemoBadge } from "@/components/status-badge";
import { CompactRangeControls, RangeControls } from "@/components/range-controls";
import { ExportButtons, exportHref } from "@/components/export-buttons";
import { Menu } from "@/components/ui/menu";
import { ClientReportView } from "@/components/reports/client-report-view";
import { ClientVisibilityToggle } from "@/components/reports/visibility-toggle";
import { ActionButton } from "@/components/action-button";
import { ChartNoteForm } from "./notes-form";
import { deleteChartNoteAction } from "./notes-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionSkeleton } from "@/components/ui/skeleton";
import { ExecutiveSummary } from "@/components/reports/executive-summary";
import { ClientDashboardsTab } from "@/components/dashboards/client-dashboards-tab";
import { ClientFacingDashboards } from "@/components/dashboards/dashboard-section";
import { ConnectedDataSection } from "@/components/dashboards/connected-data-section";
import { listClientDashboards } from "@/server/dashboards/access";
import { AdvertisingDetail, CampaignsSection, DataFreshness, hiddenMarker, HistorySection, NoAccountsState, NoteSection, PacingSection, PlatformSection, TrendsSection } from "@/components/reports/report-sections";
import { AtAGlance } from "@/components/reports/at-a-glance";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campaigns" },
  { key: "trends", label: "Trends" },
  { key: "dashboards", label: "Dashboards" },
  { key: "insights", label: "Insights" },
  { key: "setup", label: "Setup" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // Same access check as the page, so the tab title never names a client the viewer can't open.
  await requireClientView(id);
  const c = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  // No range in the URL: use the last one chosen (cookie), so the dates stick between pages.
  const sp = await withRememberedRange(await searchParams);
  const user = await requireClientView(id);
  const staff = user.role !== "CLIENT_USER";
  // Same rule as requireClientEdit, which the template save actions enforce.
  const canEdit = await userCanEditClient(user, id);

  // The header needs only the quick part of the report. The heavy figures load
  // in the background and stream into the in-page <Suspense> boundaries below
  // (not a route loading.tsx: those made value-returning server actions hang).
  const now = new Date();
  const rep = await loadClientReportHead(id, sp, now);
  const full = completeClientReport(rep, now);
  full.catch(() => {}); // Each <WithReport> awaits it and surfaces any error; this only avoids an unhandled rejection.
  const { client, preset, compareMode, range, cmpRange, pacing } = rep;
  const isDemo = client.accounts.some((a) => a.isDemo);
  const tab: Tab = staff && TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "overview";
  const base = `/clients/${id}`;
  const tabHref = (t: Tab) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "tab" && k !== "line") as [string, string][]);
    if (t !== "overview") q.set("tab", t);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const mark = hiddenMarker(rep, staff);
  const exportBase = `/api/reports/clients/${id}`;

  // Sub-pages get the range and tab so their back links return to the same view.
  const keep = (href: string) => withReportQuery(href, { ...sp, tab: sp.tab ?? "overview" });
  const switchable = staff ? await prisma.client.findMany({ where: visibleClientsWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 max-md:w-full">
        {staff && (
          <nav aria-label="Breadcrumb" className="mb-0.5 hidden md:block">
            <ol className="flex items-center gap-1 text-xs text-text-3">
              <li><Link href="/clients" className="hover:text-text hover:underline">Clients</Link></li>
              <li aria-hidden><ChevronRight className="h-3 w-3" /></li>
              <li aria-current="page" className="truncate text-text-2">{client.name}</li>
            </ol>
          </nav>
        )}
        <div className="flex items-center gap-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{client.name}</h1>
          {staff && <ClientSwitcher clientId={id} clients={switchable.map((c) => ({ value: c.id, label: c.name }))} />}
          {isDemo && <DemoBadge />}
        </div>
        <p className="hidden text-sm text-text-2 md:block">
          {rangeLabel(preset, range)}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
          {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
          {pacing.client.managerName && staff && <> · Manager: {pacing.client.managerName}</>}
        </p>
        <div className="mt-1.5"><DataFreshness rep={rep} staff={staff} setupHref={staff ? tabHref("setup") : undefined} /></div>
      </div>
      <div className="flex min-w-0 items-center gap-2 max-md:w-full max-md:justify-between md:flex-wrap">
        <div className="hidden md:block"><RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} /></div>
        <div className="md:hidden"><CompactRangeControls label={shortRangeLabel(range.from, range.to)} preset={preset} compare={compareMode} from={range.from} to={range.to} /></div>
        {staff ? (
          // The one output button: send it, or download it.
          <Menu
            label="Share"
            variant="default"
            icon={<Share2 className="h-4 w-4" aria-hidden />}
            sections={[
              {
                heading: "Send",
                items: [
                  { href: keep(`${base}/share`), label: "Share link", hint: "A link the client opens without signing in", icon: <Link2 className="h-4 w-4" /> },
                  { href: keep(`${base}/email`), label: "Email client", hint: "Draft an update from this report", icon: <Mail className="h-4 w-4" /> },
                  { href: keep(`${base}/share#schedule`), label: "Schedule email", hint: "Send the PDF automatically each month", icon: <CalendarClock className="h-4 w-4" /> },
                ],
              },
              {
                heading: "Download",
                items: [
                  { href: exportHref(exportBase, sp, "pdf"), label: "PDF", hint: "Client-facing report", icon: <FileText className="h-4 w-4" />, download: true },
                  { href: exportHref(exportBase, sp, "pdf", "internal=1"), label: "PDF + internal notes", hint: "Includes recommendations; not for the client", icon: <FileText className="h-4 w-4" />, download: true },
                  { href: exportHref(exportBase, sp, "csv"), label: "CSV", hint: "Every daily row", icon: <Download className="h-4 w-4" />, download: true },
                ],
              },
            ]}
          />
        ) : (
          <ExportButtons base={exportBase} query={sp} />
        )}
      </div>
    </div>
  );

  if (!staff) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        {header}
        <Suspense fallback={<SectionSkeleton tiles={6} cards={2} />}>
          <WithReport report={full}>
            {(rep) => {
              // Client logins also see their client-visible custom dashboards after the KPI and summary sections.
              const dashboards = <ClientFacingDashboards dashboards={listClientDashboards(user, id)} rep={rep} staff={false} basePath={base} query={sp} />;
              return client.accounts.length === 0 ? <><NoAccountsState rep={rep} staff={false} />{dashboards}</> : <ClientReportView rep={rep} basePath={base} query={sp} afterSummary={dashboards} />;
            }}
          </WithReport>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      {/* Header, date range and tabs stay in view while scrolling (desktop); on phones only the tabs stick, under the top bar. */}
      <div className="max-md:contents md:sticky md:top-0 md:z-20 md:-mx-10 md:-mt-8 md:flex md:flex-col md:gap-3 md:border-b md:border-border md:bg-background/95 md:px-10 md:pt-8 md:backdrop-blur">
        {header}
        <nav className="sticky top-12 z-20 -mx-4 -mb-px flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur max-md:-mt-3 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:backdrop-blur-none" aria-label="Client sections">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              scroll={false}
              aria-current={tab === t.key ? "page" : undefined}
              className={`inline-flex min-h-10 items-center border-b-2 px-3 py-2 text-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60 ${tab === t.key ? "border-brand font-medium text-text" : "border-transparent text-text-2 hover:text-text"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <Suspense fallback={null}>
          <ClientAlertsStrip clientId={id} user={user} />
        </Suspense>
      )}

      {tab === "overview" && client.accounts.length === 0 && (
        <Suspense fallback={<SectionSkeleton cards={2} tallFirst={false} />}>
          <WithReport report={full}>
            {(rep) => (
              <>
                <NoAccountsState rep={rep} staff />
                <ConnectedDataSection rep={rep} canEdit={canEdit} query={sp} />
                <PacingSection rep={rep} staff basePath={base} query={sp} marker={mark("pacing")} />
              </>
            )}
          </WithReport>
        </Suspense>
      )}

      {tab === "overview" && client.accounts.length > 0 && (
        <Suspense fallback={<SectionSkeleton tiles={6} cards={2} tallFirst={false} />}>
          <WithReport report={full}>
            {(rep) => (
              <>
                <AtAGlance rep={rep} />
                <AdvertisingDetail rep={rep} marker={mark("kpis")} editable={canEdit} />
                <ConnectedDataSection rep={rep} canEdit={canEdit} query={sp} />
                <ExecutiveSummary rep={rep} marker={mark("executive")} copyable compact actions={<Link href={tabHref("insights")} className="text-sm font-medium text-brand-text hover:underline">Open Insights</Link>} />
                <NoteSection rep={rep} marker={mark("summary")} />
                <PacingSection rep={rep} staff basePath={base} query={sp} marker={mark("pacing")} />
              </>
            )}
          </WithReport>
        </Suspense>
      )}

      {tab === "campaigns" && (
        <Suspense fallback={<SectionSkeleton cards={1} />}>
          <WithReport report={full}>
            {(rep) => (
              <>
                <CampaignsSection rep={rep} staff basePath={base} marker={mark("campaigns")} />
                {client.accounts.length > 1 && <PlatformSection rep={rep} staff marker={mark("platforms")} />}
              </>
            )}
          </WithReport>
        </Suspense>
      )}

      {tab === "trends" && (
        <>
          <Suspense fallback={<SectionSkeleton cards={1} />}>
            <WithReport report={full}>{(rep) => <TrendsSection rep={rep} marker={mark("trends")} staff />}</WithReport>
          </Suspense>
          {/* The note form stays outside the suspended sections. */}
          <NotesCard clientId={id} agencyId={user.agencyId} defaultDate={rep.range.to} />
          <Suspense fallback={<SectionSkeleton cards={1} tallFirst={false} />}>
            <WithReport report={full}>{(rep) => <HistorySection rep={rep} marker={mark("history")} />}</WithReport>
          </Suspense>
        </>
      )}

      {tab === "dashboards" && (
        <Suspense fallback={<SectionSkeleton tiles={6} cards={2} tallFirst={false} />}>
          <WithReport report={full}>{(rep) => <ClientDashboardsTab rep={rep} user={user} canEdit={canEdit} query={sp} />}</WithReport>
        </Suspense>
      )}

      {tab === "insights" && (
        // One place for every AI-written insight, with a clear switch for what the client sees.
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand-text" aria-hidden /> Insights</CardTitle>
            <CardDescription>The summary can go in the client&apos;s report; suggestions and answers stay with your team.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <section className="flex flex-col gap-3" aria-label="Executive summary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Executive summary</h3>
                <ClientVisibilityToggle clientId={id} section="executive" visible={rep.template.sections.executive} label="Executive summary" />
              </div>
              <Suspense fallback={<SectionSkeleton cards={1} tallFirst={false} />}>
                <WithReport report={full}>{(rep) => <ExecutiveSummary rep={rep} copyable bare />}</WithReport>
              </Suspense>
            </section>
            <div className="border-t border-border pt-5">
              <AiSuggestionsCard clientId={id} query={sp} bare />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "setup" && (
        <>
          <Suspense fallback={<SectionSkeleton cards={1} tallFirst={false} />}>
            <WithReport report={full}>{(rep) => <PlatformSection rep={rep} staff status title="Ad accounts and data" />}</WithReport>
          </Suspense>
          {/* The one place to configure this client. Sending and downloading live in the Share button. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: keep(`${base}/accounts`), Icon: Plug, title: "Ad accounts", body: "Link or unlink this client's Google, Meta, Microsoft and other ad accounts." },
              { href: "/integrations", Icon: Database, title: "Connected data sources", body: "Link CallRail, Google Analytics, Search Console, Business Profile and social pages to this client (on the Integrations page)." },
              { href: keep(`${base}/campaigns`), Icon: ListChecks, title: "Campaigns included", body: "Choose which campaigns count in reports, pacing and alerts." },
              { href: keep(`${base}/budgets`), Icon: Wallet, title: "Budgets", body: "Monthly budgets, how they're split and when pacing warns you." },
              { href: keep(`${base}/report`), Icon: FileSliders, title: "Report layout & goal", body: "The client's goal, the figures and sections they see, and the default date range." },
              { href: keep(`${base}/rankings`), Icon: Search, title: "Keyword rankings", body: "Daily Google positions for the client's keywords." },
            ].map(({ href, Icon, title, body }) => (
              <Link key={title} href={href} className="flex min-h-10 flex-col gap-1 rounded-xl border border-border bg-surface px-5 py-4 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
                <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-text-2" aria-hidden /> {title}</span>
                <span className="text-xs text-text-3">{body}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Renders sections that need the full report once it has loaded; place inside a <Suspense> boundary. */
async function WithReport({ report, children }: { report: Promise<ClientReport>; children: (rep: ClientReport) => ReactNode }) {
  return <>{children(await report)}</>;
}

/** Dated notes shown as markers on this client's charts, with an add form and teammate tagging. */
async function NotesCard({ clientId, agencyId, defaultDate }: { clientId: string; agencyId: string; defaultDate: string }) {
  const [notes, staff] = await Promise.all([
    prisma.chartNote.findMany({ where: { clientId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50 }),
    prisma.user.findMany({ where: { agencyId, deactivatedAt: null, role: { in: ["AGENCY_ADMIN", "ACCOUNT_MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const name = new Map(staff.map((u) => [u.id, u.name]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5"><StickyNote className="h-4 w-4 text-text-2" aria-hidden /> Notes on the data</CardTitle>
        <CardDescription>Pin a note to a date (a budget change, a launch, a tracking fix). It appears as ◆ on the charts; tag a teammate to email them.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartNoteForm clientId={clientId} defaultDate={defaultDate} teammates={staff} />
        {notes.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm"><span className="font-medium tabular">{formatDate(n.date.toISOString().slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}</span> · {n.text}</p>
                  <p className="text-xs text-text-3">
                    {n.authorId ? name.get(n.authorId) ?? "A former teammate" : "Someone"}
                    {n.taggedUserId && <> · tagged {name.get(n.taggedUserId) ?? "a teammate"}</>}
                    {n.clientVisible ? " · shown to the client" : " · team only"}
                  </p>
                </div>
                <ActionButton action={deleteChartNoteAction.bind(null, clientId, n.id)} label="Delete" variant="ghost" confirm="Delete this note?" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
