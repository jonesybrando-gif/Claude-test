import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/server/access";
import { prisma } from "@/server/db";
import { loadDashboardFor } from "@/server/dashboards/access";
import { readWidgets } from "@/lib/dashboards/parse";
import { SOURCE_ORDER } from "@/lib/dashboards/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardEditor } from "@/components/dashboards/dashboard-editor";
import { ApplyTemplateForm } from "@/components/dashboards/apply-template-form";

export const dynamic = "force-dynamic";

/** Edit an agency dashboard template's layout and copy it to clients. */
export default async function DashboardTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const admin = await requireAdmin();
  const t = await loadDashboardFor(admin, templateId, "edit");
  if (!t || !t.isTemplate) notFound();
  const clients = await prisma.client.findMany({
    where: { agencyId: admin.agencyId, archivedAt: null },
    select: { id: true, name: true, _count: { select: { dashboards: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <div>
        <Link href="/settings/dashboards" className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> Dashboard templates</Link>
        <p className="mt-1 text-sm text-text-2">Widgets show placeholders here; each client&apos;s copy shows that client&apos;s data.</p>
      </div>
      <DashboardEditor
        dashboardId={t.id}
        name={t.name}
        widgets={readWidgets(t.widgets)}
        data={{}}
        currency="USD"
        clientId={null}
        linked={SOURCE_ORDER}
        rangeParams={{}}
        doneHref="/settings/dashboards"
      />
      <Card id="apply">
        <CardHeader>
          <CardTitle>Apply to clients</CardTitle>
          <CardDescription>Save your changes above first: clients get the template as it was last saved.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplyTemplateForm templateId={t.id} clients={clients.map((c) => ({ id: c.id, name: c.name, dashboards: c._count.dashboards }))} />
        </CardContent>
      </Card>
    </>
  );
}
