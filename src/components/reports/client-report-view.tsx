import type { ClientReport } from "@/server/client-report";
import { ExecutiveSummary } from "./executive-summary";
import { CampaignsSection, HistorySection, KpiSection, NoteSection, PacingSection, PlatformSection, TrendsSection } from "./report-sections";

/**
 * The client-facing report: shown to client logins and on shared links. It
 * opens with the numbers (KPI tiles and one chart), then a short summary that
 * expands, then the detail. Only sections the report template includes are
 * shown, and nothing internal (recommendations, sync errors, setup links).
 */
export function ClientReportView({ rep, basePath, query }: { rep: ClientReport; basePath: string; query: Record<string, string | undefined> }) {
  const on = rep.template.sections;
  return (
    <>
      {on.kpis && <KpiSection rep={rep} />}
      {on.trends && <TrendsSection rep={rep} metrics={rep.template.trendKpis.length ? rep.template.trendKpis : undefined} title="Trend" />}
      {on.executive && <ExecutiveSummary rep={rep} compact title="Summary" />}
      {on.summary && <NoteSection rep={rep} />}
      {on.pacing && <PacingSection rep={rep} staff={false} basePath={basePath} query={query} />}
      {/* With a single ad account the breakdown would only repeat the KPI tiles. */}
      {on.platforms && rep.client.accounts.length > 1 && <PlatformSection rep={rep} staff={false} />}
      {on.campaigns && <CampaignsSection rep={rep} staff={false} basePath={basePath} />}
      {on.history && <HistorySection rep={rep} hideEmpty />}
    </>
  );
}
