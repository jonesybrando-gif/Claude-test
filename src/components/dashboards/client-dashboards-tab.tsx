import Link from "next/link";
import { LayoutDashboard, Pencil, Plus } from "lucide-react";
import type { SessionUser } from "@/lib/access";
import type { ClientReport } from "@/server/client-report";
import { listClientDashboards } from "@/server/dashboards/access";
import { canManageDashboardTemplates } from "@/lib/dashboards/access";
import { readWidgets } from "@/lib/dashboards/parse";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { DashboardMenu, DashboardVisibilityToggle } from "./dashboard-controls";
import { DashboardBody } from "./dashboard-section";

/** Range/compare query string to carry between dashboard pages. */
export function rangeQuery(query: Record<string, string | undefined>, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const k of ["range", "compare", "from", "to"]) if (query[k]) q.set(k, query[k]!);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** The client page's "Dashboards" tab: a selector of the client's dashboards and the selected one. */
export async function ClientDashboardsTab({ rep, user, canEdit, query }: { rep: ClientReport; user: SessionUser; canEdit: boolean; query: Record<string, string | undefined> }) {
  const clientId = rep.client.id;
  const base = `/clients/${clientId}`;
  const list = await listClientDashboards(user, clientId);
  const selected = list.find((d) => d.id === query.d) ?? list[0] ?? null;
  const tabHref = (id: string) => `${base}${rangeQuery(query, { tab: "dashboards", d: id })}`;
  const newHref = `${base}/dashboards/new${rangeQuery(query)}`;

  if (!selected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <LayoutDashboard className="mt-0.5 h-5 w-5 shrink-0 text-text-3" aria-hidden />
            <div>
              <p className="font-medium">No dashboards for {rep.client.name} yet</p>
              <p className="text-sm text-text-2">Build a custom view from ads, GA4, Search Console, Business Profile, calls, social and rankings, or start from a template.</p>
            </div>
          </div>
          {canEdit && <Link href={newHref} className={buttonVariants()}><Plus className="h-4 w-4" aria-hidden /> New dashboard</Link>}
        </CardContent>
      </Card>
    );
  }

  const widgets = readWidgets(selected.widgets);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex min-w-0 flex-wrap gap-1" aria-label="Dashboards">
          {list.map((d) => (
            <Link
              key={d.id}
              href={tabHref(d.id)}
              scroll={false}
              aria-current={d.id === selected.id ? "page" : undefined}
              className={cn("max-w-56 truncate rounded-md px-2.5 py-1 text-sm", d.id === selected.id ? "bg-surface font-medium text-text ring-1 ring-border" : "text-text-2 hover:text-text")}
            >
              {d.name}
            </Link>
          ))}
          {canEdit && (
            <Link href={newHref} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium text-brand-text hover:underline">
              <Plus className="h-3.5 w-3.5" aria-hidden /> New dashboard
            </Link>
          )}
        </nav>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <DashboardVisibilityToggle id={selected.id} visible={selected.clientVisible} />
            <Link href={`${base}/dashboards/${selected.id}/edit${rangeQuery(query)}`} className={buttonVariants({ size: "sm" })}>
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </Link>
            <DashboardMenu
              key={selected.id}
              id={selected.id}
              name={selected.name}
              clientId={clientId}
              order={list.map((d) => d.id)}
              canTemplate={canManageDashboardTemplates(user)}
              afterDeleteHref={`${base}${rangeQuery(query, { tab: "dashboards" })}`}
              viewHref={tabHref("__ID__")}
            />
          </div>
        )}
      </div>
      {widgets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <p className="text-sm text-text-2">This dashboard is empty.</p>
            {canEdit && <Link href={`${base}/dashboards/${selected.id}/edit${rangeQuery(query)}`} className={buttonVariants({ size: "sm" })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add widgets</Link>}
          </CardContent>
        </Card>
      ) : (
        <DashboardBody dashboard={selected} rep={rep} staff={user.role !== "CLIENT_USER"} basePath={base} query={{ ...query, tab: "dashboards", d: selected.id }} />
      )}
    </div>
  );
}
