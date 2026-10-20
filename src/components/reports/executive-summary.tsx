import { Suspense, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Lightbulb } from "lucide-react";
import type { ClientReport } from "@/server/client-report";
import { automaticSummary, getExecutiveSummary, wantsAiSummary, type ExecSummary } from "@/server/exec-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Findings({ title, icon, items, empty }: { title: string; icon: ReactNode; items: string[]; empty: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((x, i) => <li key={i} className="text-sm leading-relaxed text-text">{x}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-text-3">{empty}</p>
      )}
    </section>
  );
}

function SummaryText({ summary, pending }: { summary: ExecSummary; pending?: boolean }) {
  return (
    <div className="flex flex-col gap-4" aria-busy={pending || undefined}>
      <div className="flex flex-col gap-3">
        {summary.overview.split(/\n{2,}/).map((para, i) => (
          <p key={i} className="max-w-[90ch] text-[15px] leading-relaxed text-text">{para}</p>
        ))}
      </div>
      {(summary.working.length > 0 || summary.notWorking.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <Findings title="What's working" icon={<CircleCheck className="h-4 w-4 text-good-ink" aria-hidden />} items={summary.working} empty="Nothing stands out as clearly ahead in this period." />
          <Findings title="What needs attention" icon={<CircleAlert className="h-4 w-4 text-warning-ink" aria-hidden />} items={summary.notWorking} empty="No problem areas stand out in this period." />
        </div>
      )}
      {summary.recommendations.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-brand" aria-hidden />Recommendations</h3>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {summary.recommendations.map((x, i) => <li key={i} className="text-sm leading-relaxed text-text">{x}</li>)}
          </ol>
        </section>
      )}
      <p className="text-xs text-text-3" aria-live="polite">
        {pending ? "Writing a fuller analysis…" : summary.source === "ai" ? "Written by AI from the figures in this report. Recommendations are suggestions; nothing has been changed in the ad accounts." : "Worked out automatically from the figures in this report. Recommendations are suggestions; nothing has been changed in the ad accounts."}
      </p>
    </div>
  );
}

async function AiSummary({ rep }: { rep: ClientReport }) {
  return <SummaryText summary={await getExecutiveSummary(rep, { generate: true })} />;
}

/**
 * An overview of the selected date range, what's working, what isn't, and
 * recommendations. The automatic version
 * shows at once; an AI-written one streams in when the layout asks for it.
 */
export function ExecutiveSummary({ rep, marker }: { rep: ClientReport; marker?: ReactNode }) {
  const auto = automaticSummary(rep);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2"><CardTitle>Executive summary</CardTitle>{marker}</div>
      </CardHeader>
      <CardContent>
        {wantsAiSummary(rep) ? (
          <Suspense fallback={<SummaryText summary={auto} pending />}>
            <AiSummary rep={rep} />
          </Suspense>
        ) : (
          <SummaryText summary={auto} />
        )}
      </CardContent>
    </Card>
  );
}
