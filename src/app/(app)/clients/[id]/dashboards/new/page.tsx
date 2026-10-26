import Link from "next/link";
import { clientBackHref } from "@/lib/client-nav";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { requireClientEdit } from "@/server/access";
import { prisma } from "@/server/db";
import { createDashboardAction } from "@/server/dashboards/actions";
import { linkedSources } from "@/server/dashboards/sources";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";
import { readWidgets } from "@/lib/dashboards/parse";
import { SOURCE_LABEL } from "@/lib/dashboards/metrics";
import type { MetricSource } from "@/lib/metrics-registry";
import { NewDashboardForm, type TemplateOption } from "@/components/dashboards/new-dashboard-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New dashboard" };

export default async function NewDashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const back = clientBackHref(id, { ...(await searchParams), tab: "dashboards" });
  const user = await requireClientEdit(id);
  const [client, agencyTemplates, linked] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true } }),
    prisma.dashboard.findMany({ where: { agencyId: user.agencyId, isTemplate: true }, select: { id: true, name: true, widgets: true }, orderBy: { name: "asc" } }),
    linkedSources(id),
  ]);
  const options: TemplateOption[] = [
    ...DASHBOARD_TEMPLATES.map((t) => ({
      value: `builtin:${t.key}`,
      name: t.name,
      description: t.description,
      needs: t.sources.map((s) => ({ label: SOURCE_LABEL[s as MetricSource] ?? s, connected: linked.includes(s as MetricSource) })),
      group: "builtin" as const,
    })),
    ...agencyTemplates.map((t) => {
      const n = readWidgets(t.widgets).length;
      return { value: `agency:${t.id}`, name: t.name, description: `${n} widget${n === 1 ? "" : "s"}`, needs: [], group: "agency" as const };
    }),
  ];
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
        <h1 className="mt-1 text-xl font-semibold">New dashboard</h1>
        <p className="text-sm text-text-2">A custom view of {client.name}&apos;s data. Start blank or from a template; you can change everything afterwards.</p>
      </div>
      <NewDashboardForm action={createDashboardAction.bind(null, id)} options={options} showVisibility />
    </div>
  );
}
