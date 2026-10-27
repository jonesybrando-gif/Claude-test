import type { ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { ExecutiveSummary } from "./executive-summary";
import { AdvertisingDetail, BudgetLinesCard, CampaignsSection, HistorySection, NoteSection, PacingSection, PlatformSection, TrendsSection } from "./report-sections";
import { AtAGlance } from "./at-a-glance";
import { ClientStory } from "./client-story";

/**
 * The client-facing report: shown to client logins and on shared links. It
 * opens on four plain questions (spend, results, is it improving, what's next),
 * then the summary, then every technical section folded under "More detail".
 * Only sections the report template includes are shown, and nothing internal:
 * next steps are only the ones the agency approved; no AI suggestions, impact
 * estimates, data notes, sync errors or setup links.
 */
/** `afterSummary`: extra sections (client-visible custom dashboards) placed after the KPI and summary sections. */
export function ClientReportView({ rep, basePath, query, afterSummary }: { rep: ClientReport; basePath: string; query: Record<string, string | undefined>; afterSummary?: ReactNode }) {
  const on = rep.template.sections;
  return (
    <>
      <ClientStory rep={rep} showSearch={on.search} showWebsite={on.website} />
      {on.executive && <ExecutiveSummary rep={rep} compact title="Summary" clientFacing />}
      {on.summary && <NoteSection rep={rep} />}
      {afterSummary}
      {/* Technical detail stays one click away, so the answers above come first. */}
      <details className="group rounded-xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[15px] font-semibold hover:bg-surface-2">
          More detail
          <span className="text-sm font-normal text-text-3 max-sm:hidden">Ad figures, trends, budget and campaigns</span>
        </summary>
        <div className="flex flex-col gap-6 border-t border-border p-4">
          <AtAGlance rep={rep} />
          {on.kpis && <AdvertisingDetail rep={rep} />}
          {on.trends && <TrendsSection rep={rep} metrics={rep.template.trendKpis.length ? rep.template.trendKpis : undefined} title="Trend" />}
          {on.pacing && <PacingSection rep={rep} staff={false} basePath={basePath} query={query} showLines={false} />}
          {on.campaigns && <CampaignsSection rep={rep} staff={false} basePath={basePath} />}
          {/* With a single ad account the breakdown would only repeat the KPI tiles. */}
          {on.platforms && rep.client.accounts.length > 1 && <PlatformSection rep={rep} staff={false} />}
          {on.pacing && rep.pacing.rows.length + rep.pacing.subRows.length > 1 && <BudgetLinesCard rep={rep} staff={false} />}
          {on.history && <HistorySection rep={rep} hideEmpty />}
        </div>
      </details>
    </>
  );
}
