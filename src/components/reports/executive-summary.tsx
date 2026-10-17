import { Suspense, type ReactNode } from "react";
import type { ClientReport } from "@/server/client-report";
import { automaticSummary, getExecutiveSummary, wantsAiSummary, type ExecSummary } from "@/server/exec-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SummaryText({ summary, pending }: { summary: ExecSummary; pending?: boolean }) {
  return (
    <div className="flex flex-col gap-3" aria-busy={pending || undefined}>
      {summary.text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="max-w-[90ch] text-[15px] leading-relaxed text-text">{para}</p>
      ))}
      <p className="text-xs text-text-3" aria-live="polite">
        {pending ? "Writing a fuller summary…" : summary.source === "ai" ? "Written by AI from the figures in this report." : "Summarised automatically from the figures in this report."}
      </p>
    </div>
  );
}

async function AiSummary({ rep }: { rep: ClientReport }) {
  return <SummaryText summary={await getExecutiveSummary(rep, { generate: true })} />;
}

/**
 * A paragraph or two about the selected date range. The automatic version
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
