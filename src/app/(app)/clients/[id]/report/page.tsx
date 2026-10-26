import Link from "next/link";
import { clientBackHref } from "@/lib/client-nav";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { getClientTemplate } from "@/server/report-templates";
import { resetClientTemplateAction, saveClientGoalAction, saveClientTemplateAction } from "@/server/report-template-actions";
import { reportResults } from "@/server/client-report";
import { GoalForm } from "@/components/reports/goal-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExportButtons } from "@/components/export-buttons";
import { TemplateForm, type PreviewSample } from "@/components/reports/template-form";
import { loadClientReport } from "@/server/client-report";
import { ALL_KPI_KEYS, formatKpi, kpiValues } from "@/lib/kpis";
import { aiConfigured } from "@/server/ai/assistant";
import { draftSummaryAction } from "@/server/ai/actions";

export const dynamic = "force-dynamic";

export default async function ClientReportBuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reset?: string } & Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const { reset } = q;
  const back = clientBackHref(id, q, "setup");
  const user = await requireClientEdit(id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true, goal: true } });
  const [{ template, custom }, rep] = await Promise.all([getClientTemplate(user.agencyId, id), loadClientReport(id, {})]);
  // Real figures for the live preview, for the report's default range.
  const sample: PreviewSample = {
    clientName: client.name,
    currency: rep.client.currency,
    values: Object.fromEntries(kpiValues(ALL_KPI_KEYS, rep.perf.totals, null).map((kv) => [kv.key, formatKpi(kv.key, kv.value, rep.client.currency)])),
  };
  const isAdmin = user.role === "AGENCY_ADMIN";
  // What "Let Marketing Nexus decide" would pick right now, from the report's data.
  const guessed = reportResults({ ...rep, client: { ...rep.client, goal: null } }).current;
  const guess = guessed.goal === "AWARENESS" ? "awareness (people who clicked)" : guessed.goal === "SALES" ? "sales (conversions with their value)" : "results (conversions and leads)";

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={back} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Customize report</h1>
          <p className="text-sm text-text-2">
            Choose what {client.name}&apos;s report shows. This drives the client page and the PDF report. CSV exports always contain every daily row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/clients/${id}`} className={buttonVariants({ variant: "outline" })}>View report</Link>
          <ExportButtons base={`/api/reports/clients/${id}`} internalPdf />
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Goal</CardTitle>
          <CardDescription>The report opens with one Results figure built from this goal, using the ad platforms&apos; own counts with nothing counted twice.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm goal={client.goal} guess={guess} action={saveClientGoalAction.bind(null, id)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Report layout</CardTitle>
          <CardDescription>
            {custom ? (
              <>This client has its own layout.</>
            ) : (
              <>This client uses the agency default{isAdmin && <> (<Link className="underline" href="/settings/reports">edit it in Settings</Link>)</>}. Saving here gives this client its own layout.</>
            )}
          </CardDescription>
          {custom && (
            <form action={resetClientTemplateAction.bind(null, id)} className="mt-2">
              <Button type="submit" variant="outline" size="sm">Use the agency default instead</Button>
            </form>
          )}
        </CardHeader>
        <CardContent>
          <TemplateForm key={reset ?? "form"} template={template} action={saveClientTemplateAction.bind(null, id)} draftSummary={aiConfigured() ? draftSummaryAction.bind(null, id) : undefined} sample={sample} />
        </CardContent>
      </Card>
    </div>
  );
}
