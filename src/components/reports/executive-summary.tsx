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

/** One continuous section, laid out like a written memo so it reads (and copies) cleanly. */
function SummaryText({ summary, heading, pending, copyable }: { summary: ExecSummary; heading: string; pending?: boolean; copyable: boolean }) {
  return (
    <div className="flex flex-col gap-4" aria-busy={pending || undefined}>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-text-3" aria-live="polite">
          {pending ? "Writing a fuller analysis…" : summary.source === "ai" ? "Written by AI from the figures in this report." : "Worked out automatically from the figures in this report."} Recommendations are suggestions; nothing has been changed in the ad accounts.
        </p>
        {copyable && !pending && <CopySummaryButton html={summaryAsHtml(summary, heading)} text={summaryAsText(summary, heading)} />}
      </div>
    </div>
  );
}

async function AiSummary({ rep, heading, copyable }: { rep: ClientReport; heading: string; copyable: boolean }) {
  return <SummaryText summary={await getExecutiveSummary(rep, { generate: true })} heading={heading} copyable={copyable} />;
}

/**
 * An overview of the selected date range, what's working, what isn't, and
 * recommendations, as one section. The automatic version shows at once; an
 * AI-written one streams in when the layout asks for it.
 */
export function ExecutiveSummary({ rep, marker, copyable = false }: { rep: ClientReport; marker?: ReactNode; copyable?: boolean }) {
  const auto = automaticSummary(rep);
  const heading = `${rep.client.name}: performance summary, ${formatDate(rep.range.from)} – ${formatDate(rep.range.to, { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>Executive summary</CardTitle>{marker}</div>
      </CardHeader>
      <CardContent>
        {wantsAiSummary(rep) ? (
          <Suspense fallback={<SummaryText summary={auto} heading={heading} copyable={copyable} pending />}>
            <AiSummary rep={rep} heading={heading} copyable={copyable} />
          </Suspense>
        ) : (
          <SummaryText summary={auto} heading={heading} copyable={copyable} />
        )}
      </CardContent>
    </Card>
  );
}
