import type { ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { ExecutiveSummary } from "./executive-summary";
import { BudgetLinesCard, HistorySection, NoteSection, PacingSection, PlatformSection, TrendsSection } from "./report-sections";
import { ClientStory } from "./client-story";
import { BudgetCard, CampaignPerformance, DailyCard, ReportBand, ReportKpiTiles, SpendShare, SummaryRow } from "./report-dashboard";

/**
 * The client-facing report: shown to client logins and on shared links, under
 * the client's own logo (see ClientReportHeader). It reads like a classic
 * agency report: the summary beside the budget, the key figures as tiles,
 * then banded sections (spend and results by day, campaigns, the plain-words
 * answers), with the remaining technical detail folded under "More detail".
 * Only sections the report template includes are shown, and nothing internal:
 * next steps are only the ones the agency approved; no AI suggestions, impact
 * estimates, data notes, sync errors or setup links.
 */
/** `afterSummary`: extra sections (client-visible custom dashboards) placed after the main sections. */
export function ClientReportView({ rep, basePath, query, afterSummary }: { rep: ClientReport; basePath: string; query: Record<string, string | undefined>; afterSummary?: ReactNode }) {
  const on = rep.template.sections;
  const daily = on.trends || on.kpis;
  return (
    <>
      <SummaryRow
        summary={on.executive ? <ExecutiveSummary rep={rep} compact title="This period in brief" clientFacing /> : null}
        budget={on.pacing ? <BudgetCard rep={rep} /> : null}
      />
      {on.kpis && <ReportKpiTiles rep={rep} />}
      {on.summary && <NoteSection rep={rep} />}

      {daily && (
        <>
          <ReportBand title="Spend and results" note="Day by day, and where the budget went" />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <DailyCard rep={rep} />
            <SpendShare rep={rep} />
          </div>
        </>
      )}

      {on.campaigns && (
        <>
          <ReportBand title="Campaigns" note={rep.cmpRange ? "Change shown against the previous period" : undefined} />
          <CampaignPerformance rep={rep} />
        </>
      )}

      <ReportBand title="In plain words" note="What we spent, what came in, and what happens next" />
      <ClientStory rep={rep} showSearch={on.search} showWebsite={on.website} />

      {afterSummary}

      {/* Technical detail stays one click away, so the answers above come first. */}
      <details className="group rounded-xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[15px] font-semibold hover:bg-surface-2">
          More detail
          <span className="text-sm font-normal text-text-3 max-sm:hidden">Trends, budget lines and history</span>
        </summary>
        <div className="flex flex-col gap-6 border-t border-border p-4">
          {on.trends && <TrendsSection rep={rep} metrics={rep.template.trendKpis.length ? rep.template.trendKpis : undefined} title="Trend" />}
          {on.pacing && <PacingSection rep={rep} staff={false} basePath={basePath} query={query} showLines={false} />}
          {/* With a single ad account the breakdown would only repeat the KPI tiles. */}
          {on.platforms && rep.client.accounts.length > 1 && <PlatformSection rep={rep} staff={false} />}
          {on.pacing && rep.pacing.rows.length + rep.pacing.subRows.length > 1 && <BudgetLinesCard rep={rep} staff={false} />}
          {on.history && <HistorySection rep={rep} hideEmpty />}
        </div>
      </details>
    </>
  );
}
