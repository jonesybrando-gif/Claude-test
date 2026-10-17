import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { prisma } from "@/server/db";
import { loadClientReport } from "@/server/client-report";
import { recordShareView, resolveShareToken } from "@/server/share-links";
import { PRESET_LABEL } from "@/lib/date-ranges";
import { formatDate } from "@/lib/time";
import { buttonVariants } from "@/components/ui/button";
import { DemoBadge } from "@/components/status-badge";
import { ClientReportView } from "@/components/reports/client-report-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Advertising report", robots: { index: false, follow: false } };

/** A client-facing report opened from a shared link, without signing in. */
export default async function SharedReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const link = await resolveShareToken(token);
  if (!link) notFound();
  const [rep, agency] = await Promise.all([
    loadClientReport(link.clientId, { range: link.range ?? undefined, compare: link.compare ?? undefined }),
    prisma.agency.findUniqueOrThrow({ where: { id: link.client.agencyId }, select: { name: true, brandColor: true, logoUrl: true, reportHeader: true, reportFooter: true } }),
  ]);
  await recordShareView(link.id);
  const { client, preset, range, cmpRange, template } = rep;
  const isDemo = client.accounts.some((a) => a.isDemo);

  return (
    <div className="min-h-screen" style={{ ["--brand" as string]: agency.brandColor }}>
      <div className="h-1.5 bg-brand" />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            {agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agency.logoUrl} alt="" className="h-8 w-8 rounded" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-brand text-sm font-bold text-brand-ink">{agency.name.slice(0, 1)}</div>
            )}
            <span className="text-sm font-semibold">{agency.name}</span>
          </div>
          {agency.reportHeader && <p className="text-xs text-text-2">{agency.reportHeader}</p>}
        </div>
      </header>
      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{client.name}</h1>
              {isDemo && <DemoBadge />}
            </div>
            <p className="text-sm text-text-2">
              {template.title} · {PRESET_LABEL[preset]}: {formatDate(range.from)} – {formatDate(range.to, { month: "short", day: "numeric", year: "numeric" })}
              {cmpRange && <> · compared with {formatDate(cmpRange.from)} – {formatDate(cmpRange.to)}</>}
            </p>
          </div>
          <a href={`/r/${token}/pdf`} download className={buttonVariants({ variant: "outline" })}>
            <Download className="h-4 w-4" aria-hidden /> Download PDF
          </a>
        </div>
        <ClientReportView rep={rep} staff={false} basePath={`/r/${token}`} query={{ line: sp.line }} />
        <footer className="border-t border-border pt-4 text-xs text-text-3">
          {agency.reportFooter && <p className="mb-1">{agency.reportFooter}</p>}
          <p>Prepared by {agency.name}. Figures are as reported by each ad platform; today&apos;s partial data is excluded.</p>
        </footer>
      </main>
    </div>
  );
}
