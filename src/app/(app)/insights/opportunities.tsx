import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/server/db";
import { aiConfigured, StoredSuggestionsSchema } from "@/server/ai/assistant";
import { userCanEditClient } from "@/server/access";
import type { SessionUser } from "@/lib/access";
import { insightFingerprint } from "@/lib/next-steps";
import { formatDate, relativeTime } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Dot } from "@/components/status-dot";
import { RecommendationActions } from "@/components/ai/recommendation-actions";

const RANK = { high: 0, medium: 1, low: 2 } as const;
const TONE = { high: "critical", medium: "watch", low: "none" } as const;
const CATEGORY = { budget: "Budgets", performance: "Performance", tracking: "Tracking", data: "Data" } as const;
const TABS = [
  { key: "open", label: "Open", states: ["NEW", "REVIEWED"] },
  { key: "planned", label: "Planned", states: ["PLANNED"] },
  { key: "done", label: "Completed", states: ["DONE"] },
  { key: "dismissed", label: "Dismissed", states: ["DISMISSED"] },
] as const;
const STATE_LABEL: Record<string, string> = { NEW: "New", REVIEWED: "Reviewed", PLANNED: "Planned", DONE: "Completed", DISMISSED: "Dismissed" };

/**
 * Every client's latest AI review in one list, most important first, with what
 * the team did about each recommendation (reviewed, planned, completed,
 * dismissed). Each keeps its evidence and, when estimable, its expected impact.
 * Agency only: never shown to clients.
 */
export async function OpportunitiesList({ user, clients, status = "open", clientId }: { user: SessionUser; clients: { id: string; name: string }[]; status?: string; clientId?: string }) {
  if (!aiConfigured()) {
    return (
      <Card>
        <p className="px-5 py-10 text-center text-sm text-text-2">The AI assistant is off. Add an Anthropic API key as <code className="rounded bg-surface-2 px-1">ANTHROPIC_API_KEY</code> in the server environment to turn it on.</p>
      </Card>
    );
  }
  const scope = clientId ? clients.filter((c) => c.id === clientId) : clients;
  const ids = scope.map((c) => c.id);
  const name = new Map(clients.map((c) => [c.id, c.name]));
  // The latest review per client, without loading every older one.
  const newest = await prisma.aiInsight.groupBy({ by: ["clientId"], where: { clientId: { in: ids }, kind: "suggestions" }, _max: { createdAt: true } });
  const [latest, statuses] = await Promise.all([
    newest.length
      ? prisma.aiInsight.findMany({
          where: { kind: "suggestions", OR: newest.map((n) => ({ clientId: n.clientId, createdAt: n._max.createdAt! })) },
          select: { clientId: true, content: true, createdAt: true, rangeFrom: true, rangeTo: true },
        })
      : Promise.resolve([]),
    prisma.insightStatus.findMany({ where: { clientId: { in: ids } }, select: { clientId: true, fingerprint: true, status: true, reason: true, updatedAt: true } }),
  ]);
  const stateOf = new Map(statuses.map((s) => [`${s.clientId}|${s.fingerprint}`, s]));
  const all = latest.flatMap((row) => {
    const parsed = StoredSuggestionsSchema.safeParse(row.content);
    if (!parsed.success) return [];
    return parsed.data.suggestions.map((s, i) => {
      const st = stateOf.get(`${row.clientId}|${insightFingerprint(s.title)}`);
      return { ...s, key: `${row.clientId}-${i}`, clientId: row.clientId, createdAt: row.createdAt, rangeFrom: row.rangeFrom, rangeTo: row.rangeTo, state: st?.status ?? "NEW", reason: st?.reason ?? null };
    });
  });
  const tab = TABS.find((t) => t.key === status) ?? TABS[0];
  const counts = Object.fromEntries(TABS.map((t) => [t.key, all.filter((x) => (t.states as readonly string[]).includes(x.state)).length]));
  const items = all.filter((x) => (tab.states as readonly string[]).includes(x.state));
  items.sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.createdAt.getTime() - a.createdAt.getTime());
  const ids2 = [...new Set(items.map((i) => i.clientId))];
  const can = await Promise.all(ids2.map((id) => userCanEditClient(user, id)));
  const editable = new Set(ids2.filter((_, i) => can[i]));
  const reviewed = new Set(latest.map((l) => l.clientId));
  const notReviewed = scope.filter((c) => !reviewed.has(c.id));
  const base = clientId ? `/clients/${clientId}?tab=insights` : "/insights?view=opportunities";
  const tabHref = (key: string) => (key === "open" ? base : `${base}&status=${key}`);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[75ch] text-sm text-text-2">
        Recommendations from {clientId ? "this client's" : "each client's"} latest AI review, with the figures they rest on. They are suggestions for your team: nothing has been changed in any account, and clients never see them. “Plan it” drafts a next step for the client report that stays hidden until you approve it.
      </p>
      <nav aria-label="Recommendation status" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} aria-current={tab.key === t.key ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab.key === t.key ? "border-brand font-medium text-text" : "border-transparent text-text-2 hover:text-text"}`}>
            {t.label} <span className="tabular text-text-3">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <Card>
          <p className="flex items-center justify-center gap-2 px-5 py-12 text-center text-sm text-text-2">
            <Sparkles className="h-4 w-4 shrink-0 text-ai" aria-hidden />
            {all.length === 0 ? (clientId ? "No review yet. Choose “Generate suggestions” below." : "No reviews yet. Open a client's AI Insights tab and choose “Generate suggestions”.") : `Nothing ${tab.label.toLowerCase()}.`}
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
                        <span className="capitalize sm:hidden">{s.priority} · </span>
                        {clientId ? "" : `${name.get(s.clientId) ?? "Client"} · `}{CATEGORY[s.category]}{s.impact ? ` · ${s.impact}` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-text-3">{STATE_LABEL[s.state]}</span>
                  </summary>
                  <div className="flex flex-col gap-3 px-5 pb-5 sm:pl-[124px]">
                    <p className="text-sm leading-relaxed">{s.detail}</p>
                    <div className="rounded-lg bg-surface-2 px-4 py-3">
                      <p className="text-xs font-semibold tracking-wide text-text-3 uppercase">Evidence</p>
                      <p className="mt-1 text-sm text-text-2">{s.evidence}</p>
                      {s.impact && (
                        <>
                          <p className="mt-3 text-xs font-semibold tracking-wide text-text-3 uppercase">Expected impact · estimate, agency only</p>
                          <p className="mt-1 text-sm text-text-2">{s.impact}</p>
                        </>
                      )}
                      <p className="mt-2 text-xs text-text-3">From data for {formatDate(s.rangeFrom)} – {formatDate(s.rangeTo)}, reviewed {relativeTime(s.createdAt.toISOString()).toLowerCase()}. Drafted by AI: check before acting.</p>
                    </div>
                    {s.reason && <p className="text-xs text-text-3">Dismissed: {s.reason}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {editable.has(s.clientId) ? <RecommendationActions clientId={s.clientId} title={s.title} status={s.state} /> : <span className="text-xs text-text-3">Only the client&apos;s team can act on this.</span>}
                      {!clientId && <Link href={`/clients/${s.clientId}?tab=insights`} className="text-sm font-medium text-brand-text hover:underline">Open {name.get(s.clientId) ?? "client"}</Link>}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!clientId && notReviewed.length > 0 && all.length > 0 && (
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
