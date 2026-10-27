import type { ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { clientFacingSummary, getExecutiveSummary, summaryKey, type ExecSummary } from "@/server/exec-summary";
import { summaryAsHtml, summaryAsText, summarySections } from "@/lib/exec-summary";
import { formatDate } from "@/lib/time";
import { clientNextStepLines } from "@/server/next-steps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopySummaryButton } from "./copy-summary-button";
import { RefreshWhenReady } from "./refresh-when-ready";
import { SummaryApproval } from "./summary-approval";

/** Up to three headline points: the top win, the top issue and the top recommendation (or next step, for clients). */
function keyPoints(s: ExecSummary, clientFacing: boolean): string[] {
  const pts = [s.working[0], s.notWorking[0], clientFacing ? s.nextSteps?.[0] : s.recommendations[0]].filter((x): x is string => !!x);
  if (pts.length) return pts;
  const first = s.overview.split(/(?<=[.!?])\s+/)[0];
  return first ? [first] : [];
}

/** One continuous section, laid out like a written memo so it reads (and copies) cleanly. */
function SummaryText({ summary, heading, pending, copyable, compact, clientFacing = false }: { summary: ExecSummary; heading: string; pending?: boolean; copyable: boolean; compact?: boolean; clientFacing?: boolean }) {
  const full = <FullText summary={summary} clientFacing={clientFacing} />;
  return (
    <div className="flex flex-col gap-4" aria-busy={pending || undefined}>
      {compact ? (
        <>
          <ul className="flex max-w-[80ch] list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-text">
            {keyPoints(summary, clientFacing).map((x, i) => <li key={i} className="pl-1">{x}</li>)}
          </ul>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand-text hover:underline">
              <span className="group-open:hidden">Read full summary</span>
              <span className="hidden group-open:inline">Hide full summary</span>
            </summary>
            <div className="mt-3">{full}</div>
          </details>
        </>
      ) : (
        full
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-text-3" aria-live="polite">
          {pending ? "An AI-written summary is on its way and will replace this in a moment." : summary.source === "ai" ? "Written by AI from the figures in this report." : "Worked out automatically from the figures in this report."}
          {clientFacing ? " Results are counted by each ad platform." : " Recommendations are suggestions; nothing has been changed in the ad accounts."}
        </p>
        {copyable && !pending && <CopySummaryButton html={summaryAsHtml(summary, heading)} text={summaryAsText(summary, heading)} />}
      </div>
    </div>
  );
}

function FullText({ summary, clientFacing }: { summary: ExecSummary; clientFacing: boolean }) {
  return (
      <article className="max-w-[80ch] text-[15px] leading-relaxed text-text">
        {summary.overview.split(/\n{2,}/).map((para, i) => <p key={i} className="mb-3">{para}</p>)}
        {/* Client-facing copies show "What we're doing next" instead of the agency's recommendations, or nothing when empty. */}
        {summarySections(clientFacing).map((sec) => {
          const items = summary[sec.key] ?? [];
          if (!items.length) return null;
          const List = sec.numbered ? "ol" : "ul";
          return (
            <section key={sec.key} className="mt-4">
              <h3 className="mb-1.5 text-[15px] font-semibold">{sec.title}</h3>
              <List className={`flex flex-col gap-1.5 pl-5 ${sec.numbered ? "list-decimal" : "list-disc"}`}>
                {items.map((x, i) => <li key={i} className="pl-1">{x}</li>)}
              </List>
            </section>
          );
        })}
      </article>
  );
}

/** For client-facing copies, "What we're doing next" is the agency's approved steps, never the AI's drafts. */
function withSteps(s: ExecSummary, steps: string[] | undefined): ExecSummary {
  return steps === undefined ? s : { ...s, nextSteps: steps };
}

/**
 * An overview of the selected date range, what's working, what isn't, and
 * recommendations, as one section. Shows the saved AI-written summary when
 * there is one; otherwise the automatic version at once while the AI writes
 * one in the background, which then replaces it without a reload. The page
 * never waits on the AI.
 */
/** `clientFacing` (client logins, shared links): "What we're doing next" in agency voice replaces Recommendations. */
export async function ExecutiveSummary({ rep, marker, copyable = false, compact = false, title = "Executive summary", actions, bare = false, clientFacing = false }: { rep: ClientReport; marker?: ReactNode; copyable?: boolean; compact?: boolean; title?: string; actions?: ReactNode; bare?: boolean; clientFacing?: boolean }) {
  // Clients only ever read next steps a person approved; AI-drafted ones stay with the agency.
  const steps = clientFacing ? await clientNextStepLines(rep.client.id, rep.client.timezone) : undefined;
  // Clients only ever read AI-written text the agency approved; otherwise the automatic summary.
  const shown: ExecSummary & { pending?: boolean; insightId?: string; approved?: boolean } = clientFacing ? await clientFacingSummary(rep) : await getExecutiveSummary(rep, { generate: "background" });
  const { pending, insightId, approved, ...summary } = shown;
  const heading = `${rep.client.name}: performance summary, ${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  const body = (
    <>
      <SummaryText summary={withSteps(summary, steps)} heading={heading} copyable={copyable} compact={compact} clientFacing={clientFacing} pending={pending} />
      {pending && <RefreshWhenReady summaryKey={summaryKey(rep)} />}
      {!clientFacing && insightId && <SummaryApproval clientId={rep.client.id} insightId={insightId} approved={!!approved} />}
    </>
  );
  if (bare) return body;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2"><CardTitle>{title}</CardTitle>{marker}</div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
