import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/server/db";
import { requireClientEdit } from "@/server/access";
import { getClientTemplate } from "@/server/report-templates";
import { resetClientTemplateAction, saveClientTemplateAction } from "@/server/report-template-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExportButtons } from "@/components/export-buttons";
import { TemplateForm } from "@/components/reports/template-form";
import { aiConfigured } from "@/server/ai/assistant";
import { draftSummaryAction } from "@/server/ai/actions";

export const dynamic = "force-dynamic";

export default async function ClientReportBuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reset?: string }> }) {
  const { id } = await params;
  const { reset } = await searchParams;
  const user = await requireClientEdit(id);
  const client = await prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true } });
  const { template, custom } = await getClientTemplate(user.agencyId, id);
  const isAdmin = user.role === "AGENCY_ADMIN";

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-text"><ChevronLeft className="h-4 w-4" /> {client.name}</Link>
          <h1 className="mt-1 text-xl font-semibold">Customize report</h1>
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
          <TemplateForm key={reset ?? "form"} template={template} action={saveClientTemplateAction.bind(null, id)} draftSummary={aiConfigured() ? draftSummaryAction.bind(null, id) : undefined} />
        </CardContent>
      </Card>
    </div>
  );
}
