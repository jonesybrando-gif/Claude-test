import { Suspense, type ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { automaticSummary, getExecutiveSummary, wantsAiSummary, type ExecSummary } from "@/server/exec-summary";
import { summaryAsHtml, summaryAsText } from "@/lib/exec-summary";
import { formatDate } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopySummaryButton } from "./copy-summary-button";

const SECTIONS = [
  { key: "working", title: "What's working", numbered: false },
  { key: "notWorking", title: "What needs attention", numbered: false },
  { key: "recommendations", title: "Recommendations", numbered: true },
] as const;

/** The three points a reader needs first: what's working, what isn't, what to do. */
function KeyPoints({ summary }: { summary: ExecSummary }) {
  const firstSentence = summary.overview.split(/(?<=\.)\s/)[0];
  const points = [
    summary.working[0] && { label: "Working", text: summary.working[0] },
    summary.notWorking[0] && { label: "Needs attention", text: summary.notWorking[0] },
    summary.recommendations[0] && { label: "Recommended", text: summary.recommendations[0] },
  ].filter((p): p is { label: string; text: string } => !!p);
  if (!points.length) return <p className="max-w-[80ch] text-[15px] leading-relaxed">{firstSentence}</p>;
  return (
    <ul className="flex max-w-[90ch] flex-col gap-2 text-[15px] leading-relaxed">
      {points.map((p) => (
        <li key={p.label} className="flex gap-2"><span className="w-32 shrink-0 text-sm font-semibold text-text-2">{p.label}</span><span>{p.text}</span></li>
      ))}
    </ul>
  );
}

function Article({ summary }: { summary: ExecSummary }) {
  return (
    <article className="max-w-[80ch] text-[15px] leading-relaxed text-text">
      {summary.overview.split(/\n{2,}/).map((para, i) => <p key={i} className="mb-3">{para}</p>)}
      {SECTIONS.map((sec) => {
        const items = summary[sec.key];
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

/** One continuous section, laid out like a written memo so it reads (and copies) cleanly. */
function SummaryText({ summary, heading, pending, copyable, compact, fullHref }: { summary: ExecSummary; heading: string; pending?: boolean; copyable: boolean; compact?: boolean; fullHref?: string }) {
  if (compact) {
    return (
      <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
        <KeyPoints summary={summary} />
        {fullHref ? (
          <a href={fullHref} className="text-sm font-medium text-brand hover:underline">Read full summary and ask the AI →</a>
        ) : (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-brand hover:underline">Read full summary</summary>
            <div className="mt-3"><Article summary={summary} /></div>
          </details>
        )}
        {pending && <p className="text-xs text-text-3" aria-live="polite">Writing a fuller analysis…</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" aria-busy={pending || undefined}>
      <Article summary={summary} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-text-3" aria-live="polite">
          {pending ? "Writing a fuller analysis…" : summary.source === "ai" ? "Written by AI from the figures in this report." : "Worked out automatically from the figures in this report."} Recommendations are suggestions; nothing has been changed in the ad accounts.
        </p>
        {copyable && !pending && <CopySummaryButton html={summaryAsHtml(summary, heading)} text={summaryAsText(summary, heading)} />}
      </div>
    </div>
  );
}

async function AiSummary({ rep, ...props }: { rep: ClientReport; heading: string; copyable: boolean; compact?: boolean; fullHref?: string }) {
  return <SummaryText summary={await getExecutiveSummary(rep, { generate: true })} {...props} />;
}

/**
 * An overview of the selected date range, what's working, what isn't, and
 * recommendations, as one section. The automatic version shows at once; an
 * AI-written one streams in when the layout asks for it.
 */
export function ExecutiveSummary({ rep, marker, copyable = false, compact, fullHref }: { rep: ClientReport; marker?: ReactNode; copyable?: boolean; compact?: boolean; fullHref?: string }) {
  const auto = automaticSummary(rep);
  const heading = `${rep.client.name}: performance summary, ${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>{compact ? "Summary" : "Executive summary"}</CardTitle>{marker}</div>
      </CardHeader>
      <CardContent>
        {wantsAiSummary(rep) ? (
          <Suspense fallback={<SummaryText summary={auto} heading={heading} copyable={copyable} compact={compact} fullHref={fullHref} pending />}>
            <AiSummary rep={rep} heading={heading} copyable={copyable} compact={compact} fullHref={fullHref} />
          </Suspense>
        ) : (
          <SummaryText summary={auto} heading={heading} copyable={copyable} compact={compact} fullHref={fullHref} />
        )}
      </CardContent>
    </Card>
  );
}
