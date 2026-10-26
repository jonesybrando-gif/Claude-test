import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import type { AttentionReason } from "@/lib/portfolio";

export interface AttentionClient {
  id: string;
  name: string;
  reasons: AttentionReason[];
}

/** Home: one row per client that needs attention, with the reasons in words. */
export function NeedsAttention({ clients, total, limit = 10 }: { clients: AttentionClient[]; total: number; limit?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Needs attention ({clients.length})</CardTitle>
        <CardDescription>
          Clients with an open critical alert, a month-end forecast off budget by more than $100 or 5%, cost per result up 20% or more, results down 30% or more, or data older than 36 hours.
        </CardDescription>
      </CardHeader>
      {clients.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-text-2">
          <CheckCircle2 className="h-4 w-4 text-good-ink" aria-hidden /> All clear. None of your {total} client{total === 1 ? "" : "s"} needs attention right now.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {clients.slice(0, limit).map((c) => (
            <li key={c.id}>
              <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.reasons.map((r) => (
                      <Badge key={r.kind} variant={r.tone === "critical" ? "critical" : "warning"}>{r.label}</Badge>
                    ))}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-3" aria-hidden />
              </Link>
            </li>
          ))}
          {clients.length > limit && (
            <li className="px-5 py-2.5 text-sm">
              <Link href="/performance?attention=1" className="text-brand-text hover:underline">See all {clients.length} on All clients</Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
