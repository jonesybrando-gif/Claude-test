import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { AttentionKind, AttentionReason } from "@/lib/portfolio";
import { Dot } from "../status-dot";

export interface AttentionClient {
  id: string;
  name: string;
  reasons: AttentionReason[];
  tier: "critical" | "watch";
}

/** The one thing to do about a client's most important reason. */
function actionFor(kind: AttentionKind, id: string): { href: string; label: string } {
  switch (kind) {
    case "disconnected":
      return { href: `/clients/${id}/accounts`, label: "Reconnect" };
    case "alerts":
      return { href: `/alerts?client=${id}`, label: "View alert" };
    case "over":
    case "under":
      return { href: `/clients/${id}/budgets`, label: "Review budget" };
    case "stale":
      return { href: `/clients/${id}?tab=setup`, label: "Check data" };
    default:
      return { href: `/clients/${id}`, label: "Investigate" };
  }
}

/**
 * Home: the few clients to look at first — Critical before Watch — each with
 * one short reason and one action. The full list lives on Clients.
 */
export function NeedsAttention({ clients, total, limit = 5 }: { clients: AttentionClient[]; total: number; limit?: number }) {
  return (
    <section aria-labelledby="needs-attention" className="rounded-xl border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-2">
        <h2 id="needs-attention" className="text-[15px] font-semibold">Needs attention</h2>
        {clients.length > 0 && <Link href="/clients?filter=attention" className="text-[13px] font-medium text-brand-text hover:underline">View all {clients.length}</Link>}
      </div>
      {clients.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pt-1 pb-5 text-sm text-text-2">
          <CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden /> All clear. None of your {total} client{total === 1 ? "" : "s"} needs attention.
        </p>
      ) : (
        <ul className="px-2 pb-2">
          {clients.slice(0, limit).map((c) => {
            const top = c.reasons[0];
            const act = actionFor(top.kind, c.id);
            return (
              <li key={c.id} className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                <Dot tone={c.tier} />
                <span className="sr-only">{c.tier === "critical" ? "Critical" : "Watch"}:</span>
                <Link href={`/clients/${c.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{c.name}</span>
                  <span className="block truncate text-[13px] text-text-2">
                    {top.label}
                    {c.reasons.length > 1 && <span className="text-text-3"> · +{c.reasons.length - 1} more</span>}
                  </span>
                </Link>
                <Link href={act.href} className="shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold text-brand-text hover:bg-surface hover:underline">
                  {act.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
