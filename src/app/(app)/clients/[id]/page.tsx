import Link from "next/link";
import { FileSliders, Link2, ListChecks, Mail, Plug, Settings2 } from "lucide-react";
import { AiSuggestionsCard } from "@/components/ai/suggestions-card";
import { requireClientView } from "@/server/access";
import { loadClientReport } from "@/server/client-report";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";
import { buttonVariants } from "@/components/ui/button";
import { DemoBadge } from "@/components/status-badge";
import { RangeControls } from "@/components/range-controls";
import { ExportButtons } from "@/components/export-buttons";
import { ClientReportView } from "@/components/reports/client-report-view";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClientView(id);
  const staff = user.role !== "CLIENT_USER";

  const rep = await loadClientReport(id, sp);
  const { client, preset, compareMode, range, cmpRange, pacing } = rep;
  const isDemo = client.accounts.some((a) => a.isDemo);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{client.name}</h1>
            {isDemo && <DemoBadge />}
          </div>
          <p className="text-sm text-text-2">
            {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
            {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
            {pacing.client.managerName && staff && <> · Manager: {pacing.client.managerName}</>}
            {" "}· {client.timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeControls preset={preset} compare={compareMode} from={range.from} to={range.to} />
          <ExportButtons base={`/api/reports/clients/${id}`} query={sp} internalPdf={staff} />
          {staff && (
            <>
              <Link href={`/clients/${id}/accounts`} className={buttonVariants({ variant: "outline" })}>
                <Plug className="h-4 w-4" /> Ad accounts
              </Link>
              <Link href={`/clients/${id}/campaigns`} className={buttonVariants({ variant: "outline" })}>
                <ListChecks className="h-4 w-4" /> Campaigns
              </Link>
              <Link href={`/clients/${id}/share`} className={buttonVariants({ variant: "outline" })}>
                <Link2 className="h-4 w-4" /> Share link
              </Link>
              <Link href={`/clients/${id}/email`} className={buttonVariants({ variant: "outline" })}>
                <Mail className="h-4 w-4" /> Email client
              </Link>
              <Link href={`/clients/${id}/report`} className={buttonVariants({ variant: "outline" })}>
                <FileSliders className="h-4 w-4" /> Customize report
              </Link>
              <Link href={`/clients/${id}/budgets`} className={buttonVariants({ variant: "outline" })}>
                <Settings2 className="h-4 w-4" /> Budgets
              </Link>
            </>
          )}
        </div>
      </div>

      <ClientReportView rep={rep} staff={staff} basePath={`/clients/${id}`} query={sp} afterKpis={staff ? <AiSuggestionsCard clientId={id} query={sp} /> : null} />
    </div>
  );
}
