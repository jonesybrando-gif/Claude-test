import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";
import type { DataAssetKind, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { ClientReport } from "@/server/client-report";
import { linkedSources } from "@/server/dashboards/sources";
import { openTemplateDashboardAction } from "@/server/dashboards/actions";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";
import type { DashboardWidget } from "@/lib/dashboards/types";
import type { MetricSource } from "@/lib/metrics-registry";
import { DashboardBody } from "./dashboard-section";

const KIND_SOURCE: Record<DataAssetKind, MetricSource> = {
  GA4_PROPERTY: "ga4",
  GSC_SITE: "gsc",
  GBP_LOCATION: "gbp",
  FB_PAGE: "facebook",
  IG_ACCOUNT: "instagram",
  CALLRAIL_COMPANY: "callrail",
  RANK_PROJECT: "rank",
};

/** A template's headline numbers: its first row of KPI tiles, moved to the top. */
function headlineWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  const kpis = widgets.filter((w) => w.kind === "kpi");
  if (!kpis.length) return [];
  const top = Math.min(...kpis.map((w) => w.y));
  return kpis.filter((w) => w.y === top).map((w) => ({ ...w, y: 0 }));
}

/**
 * Overview section: the headline numbers from every non-ad source linked to
 * the client (CallRail, GA4, Search Console, Business Profile, social,
 * rankings), each with a link to its full dashboard.
 */
export async function ConnectedDataSection({ rep, canEdit, query }: { rep: ClientReport; canEdit: boolean; query: Record<string, string | undefined> }) {
  const clientId = rep.client.id;
  const base = `/clients/${clientId}`;
  const [linked, assets, dashboards] = await Promise.all([
    linkedSources(clientId),
    prisma.dataAsset.findMany({ where: { clientId, status: { not: "DISCONNECTED" } }, select: { kind: true, name: true }, orderBy: { name: "asc" } }),
    prisma.dashboard.findMany({ where: { clientId, isTemplate: false }, select: { id: true, name: true } }),
  ]);
  const sections = DASHBOARD_TEMPLATES.filter((t) => t.sources.length > 0 && !t.sources.includes("ads") && t.sources.every((s) => linked.includes(s as MetricSource)))
    .map((t) => ({ t, widgets: headlineWidgets(t.widgets) }))
    .filter((s) => s.widgets.length > 0);
  if (sections.length === 0) return null;
  const q = new URLSearchParams();
  for (const k of ["range", "compare", "from", "to"]) if (query[k]) q.set(k, query[k]!);

  return (
    <section aria-labelledby="connected-data" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="connected-data" className="text-base font-semibold">Connected data</h2>
        <Link href="/integrations" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><Plug className="h-3.5 w-3.5" aria-hidden /> Manage sources</Link>
      </div>
      {sections.map(({ t, widgets }) => {
        const names = assets.filter((a) => t.sources.includes(KIND_SOURCE[a.kind])).map((a) => a.name);
        const existing = dashboards.find((d) => d.name.toLowerCase() === t.name.toLowerCase());
        const href = existing ? `${base}?${new URLSearchParams([...q, ["tab", "dashboards"], ["d", existing.id]])}` : null;
        return (
          <div key={t.key} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t.name}</h3>
                {names.length > 0 && <p className="truncate text-xs text-text-3">{names.join(" · ")}</p>}
              </div>
              {href ? (
                <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">Full dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
              ) : canEdit ? (
                <form action={openTemplateDashboardAction.bind(null, clientId, t.key)}>
                  <button type="submit" className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">Full dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>
                </form>
              ) : null}
            </div>
            <DashboardBody dashboard={{ widgets: widgets as unknown as Prisma.JsonValue }} linked={linked} rep={rep} staff basePath={base} query={query} />
          </div>
        );
      })}
    </section>
  );
}
