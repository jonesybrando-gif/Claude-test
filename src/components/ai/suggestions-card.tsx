import { Sparkles } from "lucide-react";
import { prisma } from "@/server/db";
import { aiConfigured, SuggestionsSchema } from "@/server/ai/assistant";
import { formatDate, relativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateSuggestionsButton } from "./generate-button";
import { AskPanel } from "./ask-panel";

const PRIORITY = { high: "critical", medium: "warning", low: "neutral" } as const;

/** Staff-only: the latest AI suggestions for a client, with a button to refresh them. `bare` drops the card frame. */
export async function AiSuggestionsCard({ clientId, query, bare = false }: { clientId: string; query: Record<string, string | undefined>; bare?: boolean }) {
  const latest = await prisma.aiInsight.findFirst({ where: { clientId, kind: "suggestions" }, orderBy: { createdAt: "desc" } });
  const parsed = latest ? SuggestionsSchema.safeParse(latest.content) : null;
  const items = parsed?.success ? parsed.data.suggestions : [];
  const configured = aiConfigured();
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        {bare ? (
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand" aria-hidden /> Suggestions <span className="font-normal text-text-3">· only your team sees these</span></h3>
        ) : (
          <CardTitle className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand" aria-hidden /> AI assistant</CardTitle>
        )}
        <CardDescription>
          {latest
            ? <>Generated {relativeTime(latest.createdAt.toISOString()).toLowerCase()} from data for {formatDate(latest.rangeFrom)} – {formatDate(latest.rangeTo)}. Drafted by AI from this page&apos;s data: check before acting.</>
            : "Proactive recommendations drafted from this client's data."}
        </CardDescription>
      </div>
      {configured && <GenerateSuggestionsButton clientId={clientId} query={query} hasExisting={!!latest} />}
    </div>
  );
  const body = (
    <>
      {!configured ? (
        <p className="text-sm text-text-2">The AI assistant is off. To turn it on, add an Anthropic API key as <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY</code> in the server environment. Usage is billed by Anthropic separately.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-3">No suggestions yet. Choose “Generate suggestions” to analyse the selected period.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {items.map((s, i) => (
            <li key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={PRIORITY[s.priority]}>{s.priority}</Badge>
                <span className="text-xs text-text-3">{s.category}</span>
                <span className="font-medium">{s.title}</span>
              </div>
              <p className="text-sm text-text-2">{s.detail}</p>
              <p className="text-xs text-text-3">Based on: {s.evidence}</p>
            </li>
          ))}
        </ol>
      )}
      {configured && <div className="mt-4"><AskPanel clientId={clientId} query={query} /></div>}
    </>
  );
  if (bare) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        {body}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>{header}</CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
