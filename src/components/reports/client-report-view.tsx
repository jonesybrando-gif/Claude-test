import type { ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { ExecutiveSummary } from "./executive-summary";
import { AdvertisingDetail, BudgetLinesCard, CampaignsSection, HistorySection, NoteSection, PacingSection, PlatformSection, TrendsSection } from "./report-sections";
import { AtAGlance } from "./at-a-glance";

/**
 * The client-facing report: shown to client logins and on shared links. It
 * opens on At a glance (one sentence, four tiles, what needs attention), then
 * the full KPI tiles folded under "Advertising detail", one chart, a short
 * summary that expands, then the detail. Only sections the report template
 * includes are shown, and nothing internal (the agency's recommendations
 * become "What we're doing next"; no data notes, sync errors or setup links).
 */
/** `afterSummary`: extra sections (client-visible custom dashboards) placed after the KPI and summary sections. */
export function ClientReportView({ rep, basePath, query, afterSummary }: { rep: ClientReport; basePath: string; query: Record<string, string | undefined>; afterSummary?: ReactNode }) {
  const on = rep.template.sections;
  return (
    <>
      <AtAGlance rep={rep} />
      {on.kpis && <AdvertisingDetail rep={rep} />}
      {on.trends && <TrendsSection rep={rep} metrics={rep.template.trendKpis.length ? rep.template.trendKpis : undefined} title="Trend" />}
      {on.executive && <ExecutiveSummary rep={rep} compact title="Summary" clientFacing />}
      {on.summary && <NoteSection rep={rep} />}
      {afterSummary}
      {on.pacing && <PacingSection rep={rep} staff={false} basePath={basePath} query={query} showLines={false} />}
      {/* Detail tables last. */}
      {on.campaigns && <CampaignsSection rep={rep} staff={false} basePath={basePath} />}
      {/* With a single ad account the breakdown would only repeat the KPI tiles. */}
      {on.platforms && rep.client.accounts.length > 1 && <PlatformSection rep={rep} staff={false} />}
      {on.pacing && rep.pacing.rows.length + rep.pacing.subRows.length > 1 && <BudgetLinesCard rep={rep} staff={false} />}
      {on.history && <HistorySection rep={rep} hideEmpty />}
    </>
  );
}
