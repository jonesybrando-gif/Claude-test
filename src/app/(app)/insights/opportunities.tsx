import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/server/db";
import { aiConfigured, SuggestionsSchema } from "@/server/ai/assistant";
import { formatDate, relativeTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/status-dot";

const RANK = { high: 0, medium: 1, low: 2 } as const;
const TONE = { high: "critical", medium: "watch", low: "none" } as const;
const CATEGORY = { budget: "Budgets", performance: "Performance", tracking: "Tracking", data: "Data" } as const;

/**
 * Every client's latest AI review in one list, most important first. Each item
 * keeps its evidence and links to the client's AI Insights tab, where the review
 * can be refreshed. Suggestions are drafts for the agency: never shown to clients.
 */
export async function OpportunitiesList({ clients }: { clients: { id: string; name: string }[] }) {
  if (!aiConfigured()) {
    return (
      <Card>
        <p className="px-5 py-10 text-center text-sm text-text-2">The AI assistant is off. Add an Anthropic API key as <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY</code> in the server environment to turn it on.</p>
      </Card>
    );
  }
  const name = new Map(clients.map((c) => [c.id, c.name]));
  // The latest review per client, without loading every older one.
  const newest = await prisma.aiInsight.groupBy({ by: ["clientId"], where: { clientId: { in: clients.map((c) => c.id) }, kind: "suggestions" }, _max: { createdAt: true } });
  const latest = newest.length
    ? await prisma.aiInsight.findMany({
        where: { kind: "suggestions", OR: newest.map((n) => ({ clientId: n.clientId, createdAt: n._max.createdAt! })) },
        select: { clientId: true, content: true, createdAt: true, rangeFrom: true, rangeTo: true },
      })
    : [];
  const items = latest.flatMap((row) => {
    const parsed = SuggestionsSchema.safeParse(row.content);
    if (!parsed.success) return [];
    return parsed.data.suggestions.map((s, i) => ({ ...s, key: `${row.clientId}-${i}`, clientId: row.clientId, createdAt: row.createdAt, rangeFrom: row.rangeFrom, rangeTo: row.rangeTo }));
  });
  items.sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.createdAt.getTime() - a.createdAt.getTime());
  const reviewed = new Set(latest.map((l) => l.clientId));
  const notReviewed = clients.filter((c) => !reviewed.has(c.id));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[75ch] text-sm text-text-2">
        Recommendations from each client&apos;s latest AI review, with the figures they rest on. They are drafts for your team, never shown to clients. Run a fresh review from a client&apos;s AI Insights tab.
      </p>
      {items.length === 0 ? (
        <Card>
          <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-text-2">
            <Sparkles className="h-4 w-4 text-brand-text" aria-hidden /> No reviews yet. Open a client&apos;s AI Insights tab and choose “Generate suggestions”.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map((s) => (
              <li key={s.key}>
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[88px_1fr_auto] items-start gap-3 px-5 py-4 hover:bg-surface-2 max-sm:grid-cols-[1fr_auto]">
                    <span className="flex items-center gap-2 text-xs font-semibold capitalize max-sm:hidden"><Dot tone={TONE[s.priority]} /> {s.priority}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text">{s.title}</span>
                      <span className="block text-[13px] text-text-2">
                        <span className="sm:hidden capitalize">{s.priority} · </span>
                        {name.get(s.clientId) ?? "Client"} · {CATEGORY[s.category]} · {relativeTime(s.createdAt.toISOString()).toLowerCase()}
                      </span>
                    </span>
                    <span aria-hidden className="text-text-3 transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="flex flex-col gap-3 px-5 pb-5 sm:pl-[124px]">
                    <p className="text-sm leading-relaxed">{s.detail}</p>
                    <div className="rounded-lg bg-surface-2 px-4 py-3">
                      <p className="text-xs font-semibold tracking-wide text-text-3 uppercase">Evidence</p>
                      <p className="mt-1 text-sm text-text-2">{s.evidence}</p>
                      <p className="mt-2 text-xs text-text-3">From data for {formatDate(s.rangeFrom)} – {formatDate(s.rangeTo)}. Drafted by AI: check before acting.</p>
                    </div>
                    <Link href={`/clients/${s.clientId}?tab=insights`} className="self-start text-sm font-medium text-brand-text hover:underline">Open {name.get(s.clientId) ?? "client"}&apos;s AI Insights</Link>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {notReviewed.length > 0 && items.length > 0 && (
        <p className="text-sm text-text-3">
          Not reviewed yet: {notReviewed.slice(0, 6).map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link href={`/clients/${c.id}?tab=insights`} className="text-brand-text hover:underline">{c.name}</Link></span>
          ))}
          {notReviewed.length > 6 && ` and ${notReviewed.length - 6} more`}.
        </p>
      )}
    </div>
  );
}
