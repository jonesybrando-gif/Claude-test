import Link from "next/link";
import { Pencil } from "lucide-react";
import { requireAdmin } from "@/server/access";
import { prisma } from "@/server/db";
import { createTemplateAction } from "@/server/dashboards/actions";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboards/templates";
import { readWidgets } from "@/lib/dashboards/parse";
import { SOURCE_LABEL } from "@/lib/dashboards/metrics";
import type { MetricSource } from "@/lib/metrics-registry";
import { relativeTime } from "@/lib/time";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { NewDashboardForm } from "@/components/dashboards/new-dashboard-form";
import { DashboardMenu } from "@/components/dashboards/dashboard-controls";

export const dynamic = "force-dynamic";

/** Agency dashboard templates: list, create, edit and apply to clients. */
export default async function DashboardTemplatesPage() {
  const admin = await requireAdmin();
  const templates = await prisma.dashboard.findMany({ where: { agencyId: admin.agencyId, isTemplate: true }, orderBy: { name: "asc" } });
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard templates</CardTitle>
          <CardDescription>Layouts your team can start client dashboards from, or copy to many clients at once. Save any client dashboard as a template from its More menu.</CardDescription>
        </CardHeader>
        {templates.length === 0 ? (
          <CardContent className="text-sm text-text-3">No agency templates yet. Create one below or save one from a client&apos;s dashboard.</CardContent>
        ) : (
          <Table>
            <THead>
              <tr><TH className="pl-5">Template</TH><TH>Widgets</TH><TH>Updated</TH><TH className="pr-5 text-right">Actions</TH></tr>
            </THead>
            <TBody>
              {templates.map((t) => (
                <TR key={t.id}>
                  <TD className="pl-5"><Link href={`/settings/dashboards/${t.id}`} className="font-medium hover:underline">{t.name}</Link></TD>
                  <TD>{readWidgets(t.widgets).length}</TD>
                  <TD className="text-text-2">{relativeTime(t.updatedAt.toISOString())}</TD>
                  <TD className="pr-5">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/settings/dashboards/${t.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</Link>
                      <Link href={`/settings/dashboards/${t.id}#apply`} className={buttonVariants({ variant: "outline", size: "sm" })}>Apply to clients</Link>
                      <DashboardMenu id={t.id} name={t.name} clientId={null} order={[]} canTemplate={false} afterDeleteHref="/settings/dashboards" viewHref="/settings/dashboards/__ID__" />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="h-4" />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New template</CardTitle>
          <CardDescription>Start blank or from a ready-made layout, then arrange widgets.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewDashboardForm
            action={createTemplateAction}
            options={DASHBOARD_TEMPLATES.map((t) => ({ value: `builtin:${t.key}`, name: t.name, description: t.description, needs: t.sources.map((s) => ({ label: SOURCE_LABEL[s as MetricSource] ?? s, connected: true })), group: "builtin" }))}
            showVisibility={false}
            submitLabel="Create template"
          />
        </CardContent>
      </Card>
    </>
  );
}
