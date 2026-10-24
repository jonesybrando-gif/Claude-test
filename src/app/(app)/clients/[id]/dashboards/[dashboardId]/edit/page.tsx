import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireClientEdit } from "@/server/access";
import { loadClientReport } from "@/server/client-report";
import { loadDashboardFor } from "@/server/dashboards/access";
import { contextFromReport, resolveWidgets } from "@/server/dashboards/data";
import { linkedSources } from "@/server/dashboards/sources";
import { readWidgets } from "@/lib/dashboards/parse";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";
import { RangeControls } from "@/components/range-controls";
import { DashboardEditor } from "@/components/dashboards/dashboard-editor";
import { adSlots } from "@/components/dashboards/dashboard-section";
import { rangeQuery } from "@/components/dashboards/client-dashboards-tab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit dashboard" };

export default async function EditDashboardPage({ params, searchParams }: { params: Promise<{ id: string; dashboardId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id, dashboardId } = await params;
  const sp = await searchParams;
  const user = await requireClientEdit(id);
  const dashboard = await loadDashboardFor(user, dashboardId, "edit");
  if (!dashboard || dashboard.clientId !== id) notFound();
  const rangeParams = { range: sp.range, compare: sp.compare, from: sp.from, to: sp.to };
  const [rep, linked] = await Promise.all([loadClientReport(id, rangeParams), linkedSources(id)]);
  const widgets = readWidgets(dashboard.widgets);
  const data = await resolveWidgets(widgets, contextFromReport(rep, linked));
  const base = `/clients/${id}`;
  const doneHref = `${base}${rangeQuery(sp, { tab: "dashboards", d: dashboard.id })}`;
  const { range, cmpRange, preset, compareMode, client } = rep;
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={doneHref} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
          <h1 className="mt-1 text-xl font-semibold">Edit dashboard</h1>
          <p className="text-sm text-text-2">
            {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
            {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
          </p>
        </div>
        <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
      </div>
      <DashboardEditor
        dashboardId={dashboard.id}
        name={dashboard.name}
        widgets={widgets}
        data={data}
        currency={client.currency}
        slots={adSlots({ rep, staff: true, basePath: base, query: { ...sp, tab: "dashboards", d: dashboard.id } }, "all")}
        clientId={id}
        linked={linked}
        rangeParams={rangeParams}
        doneHref={doneHref}
      />
    </div>
  );
}
