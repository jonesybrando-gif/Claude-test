import { Suspense, type ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { automaticSummary, getExecutiveSummary, wantsAiSummary, type ExecSummary } from "@/server/exec-summary";
import { summaryAsHtml, summaryAsText, summarySections } from "@/lib/exec-summary";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopySummaryButton } from "./copy-summary-button";

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
            <summary className="cursor-pointer text-sm font-medium text-brand hover:underline">
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
          {pending ? "Writing a fuller analysis…" : summary.source === "ai" ? "Written by AI from the figures in this report." : "Worked out automatically from the figures in this report."}
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

async function AiSummary({ rep, heading, copyable, compact, clientFacing }: { rep: ClientReport; heading: string; copyable: boolean; compact?: boolean; clientFacing?: boolean }) {
  return <SummaryText summary={await getExecutiveSummary(rep, { generate: true })} heading={heading} copyable={copyable} compact={compact} clientFacing={clientFacing} />;
}

/**
 * An overview of the selected date range, what's working, what isn't, and
 * recommendations, as one section. The automatic version shows at once; an
 * AI-written one streams in when the layout asks for it.
 */
/** `clientFacing` (client logins, shared links): "What we're doing next" in agency voice replaces Recommendations. */
export function ExecutiveSummary({ rep, marker, copyable = false, compact = false, title = "Executive summary", actions, bare = false, clientFacing = false }: { rep: ClientReport; marker?: ReactNode; copyable?: boolean; compact?: boolean; title?: string; actions?: ReactNode; bare?: boolean; clientFacing?: boolean }) {
  const auto = automaticSummary(rep);
  const heading = `${rep.client.name}: performance summary, ${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  const body = wantsAiSummary(rep) ? (
    <Suspense fallback={<SummaryText summary={auto} heading={heading} copyable={copyable} compact={compact} clientFacing={clientFacing} pending />}>
      <AiSummary rep={rep} heading={heading} copyable={copyable} compact={compact} clientFacing={clientFacing} />
    </Suspense>
  ) : (
    <SummaryText summary={auto} heading={heading} copyable={copyable} compact={compact} clientFacing={clientFacing} />
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
