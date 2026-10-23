import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, Download, FileSliders, FileText, Link2, ListChecks, Mail, Plug, Settings2, Share2, Wallet } from "lucide-react";
import { AiSuggestionsCard } from "@/components/ai/suggestions-card";
import { requireClientView } from "@/server/access";
import { prisma } from "@/server/db";
import { loadClientReport } from "@/server/client-report";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";
import { DemoBadge } from "@/components/status-badge";
import { RangeControls } from "@/components/range-controls";
import { ExportButtons, exportHref } from "@/components/export-buttons";
import { Menu } from "@/components/ui/menu";
import { ClientReportView } from "@/components/reports/client-report-view";
import { ExecutiveSummary } from "@/components/reports/executive-summary";
import { CampaignsSection, hiddenMarker, HistorySection, KpiSection, NoteSection, PacingSection, PlatformSection, TrendsSection } from "@/components/reports/report-sections";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campaigns" },
  { key: "trends", label: "Trends" },
  { key: "insights", label: "Insights" },
  { key: "setup", label: "Setup" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClientView(id);
  const staff = user.role !== "CLIENT_USER";

  const rep = await loadClientReport(id, sp);
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
  const rangeQs = `range=${preset}&from=${range.from}&to=${range.to}`;
  const exportBase = `/api/reports/clients/${id}`;

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold">{client.name}</h1>
          {isDemo && <DemoBadge />}
        </div>
        <p className="text-sm text-text-2">
          {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
          {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
          {pacing.client.managerName && staff && <> · Manager: {pacing.client.managerName}</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
        {staff ? (
          <>
            <Menu
              label="Setup"
              icon={<Settings2 className="h-4 w-4" aria-hidden />}
              sections={[
                {
                  items: [
                    { href: `${base}/accounts`, label: "Ad accounts", hint: "Link or unlink advertising accounts", icon: <Plug className="h-4 w-4" /> },
                    { href: `${base}/campaigns?${rangeQs}`, label: "Campaigns", hint: "Choose which campaigns count", icon: <ListChecks className="h-4 w-4" /> },
                    { href: `${base}/budgets`, label: "Budgets", hint: "Monthly budgets and pacing rules", icon: <Wallet className="h-4 w-4" /> },
                    { href: `${base}/report`, label: "Customize report", hint: "KPIs and sections the client sees", icon: <FileSliders className="h-4 w-4" /> },
                  ],
                },
              ]}
            />
            <Menu
              label="Share report"
              variant="default"
              icon={<Share2 className="h-4 w-4" aria-hidden />}
              sections={[
                {
                  heading: "Send",
                  items: [
                    { href: `${base}/share`, label: "Share link", hint: "A link the client opens without signing in", icon: <Link2 className="h-4 w-4" /> },
                    { href: `${base}/email`, label: "Email client", hint: "Draft an update from this report", icon: <Mail className="h-4 w-4" /> },
                    { href: `${base}/share#schedule`, label: "Schedule email", hint: "Send the PDF automatically each month", icon: <CalendarClock className="h-4 w-4" /> },
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
          </>
        ) : (
          <ExportButtons base={exportBase} query={sp} />
        )}
      </div>
    </div>
  );

  if (!staff) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
        {header}
        <ClientReportView rep={rep} basePath={base} query={sp} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      {/* Header, date range and tabs stay in view while scrolling (desktop). */}
      <div className="-mx-4 -mt-6 flex flex-col gap-3 border-b border-border bg-background/95 px-4 pt-6 backdrop-blur md:sticky md:top-0 md:z-20 md:-mx-8 md:px-8">
        {header}
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Client sections">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              scroll={false}
              aria-current={tab === t.key ? "page" : undefined}
              className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-brand font-medium text-text" : "border-transparent text-text-2 hover:text-text"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <>
          <KpiSection rep={rep} marker={mark("kpis")} />
          <ExecutiveSummary rep={rep} marker={mark("executive")} copyable compact actions={<Link href={tabHref("insights")} className="text-sm font-medium text-brand hover:underline">Open Insights</Link>} />
          <NoteSection rep={rep} marker={mark("summary")} />
          <PacingSection rep={rep} staff basePath={base} query={sp} marker={mark("pacing")} />
        </>
      )}

      {tab === "campaigns" && (
        <>
          <CampaignsSection rep={rep} staff basePath={base} marker={mark("campaigns")} />
          {client.accounts.length > 1 && <PlatformSection rep={rep} staff marker={mark("platforms")} />}
        </>
      )}

      {tab === "trends" && (
        <>
          <TrendsSection rep={rep} marker={mark("trends")} />
          <HistorySection rep={rep} marker={mark("history")} />
        </>
      )}

      {tab === "insights" && (
        <>
          <ExecutiveSummary rep={rep} marker={mark("executive")} copyable />
          <AiSuggestionsCard clientId={id} query={sp} />
        </>
      )}

      {tab === "setup" && (
        <>
          <PlatformSection rep={rep} staff status title="Ad accounts and data" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: `${base}/accounts`, Icon: Plug, title: "Ad accounts", body: "Link or unlink this client's advertising accounts." },
              { href: `${base}/campaigns?${rangeQs}`, Icon: ListChecks, title: "Campaigns", body: "Choose which campaigns count in reports and pacing." },
              { href: `${base}/budgets`, Icon: Wallet, title: "Budgets", body: "Monthly budgets, distribution and pacing thresholds." },
              { href: `${base}/report`, Icon: FileSliders, title: "Customize report", body: "KPIs, sections and the default range the client sees." },
              { href: `${base}/share`, Icon: Link2, title: "Share links", body: "Links the client can open without signing in." },
              { href: `${base}/email`, Icon: Mail, title: "Email client", body: "Draft and send an update from this report." },
            ].map(({ href, Icon, title, body }) => (
              <Link key={title} href={href} className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-5 py-4 hover:bg-surface-2">
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
