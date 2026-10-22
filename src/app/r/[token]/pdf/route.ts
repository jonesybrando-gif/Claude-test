import { NextResponse, type NextRequest } from "next/server";
import { loadClientReport } from "@/server/client-report";
import { renderClientReportPdf } from "@/server/pdf/reports";
import { getExecutiveSummary } from "@/server/exec-summary";
import { agencyBrand } from "@/server/pdf/brand";
import { resolveShareToken } from "@/server/share-links";
import { hasShareAccess, shareCookieName } from "@/server/share-access";
import { slug } from "@/lib/csv";

export const maxDuration = 60;

/** Client-facing PDF for a shared link. Never includes internal recommendations. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveShareToken(token);
  if (!link) return NextResponse.json({ error: "This link has expired or been turned off." }, { status: 404 });
  if (!hasShareAccess(link, req.cookies.get(shareCookieName(link.id))?.value)) return NextResponse.json({ error: "Enter the report's password first." }, { status: 401 });
  const report = await loadClientReport(link.clientId, { range: link.range ?? undefined, compare: link.compare ?? undefined });
  const pdf = await renderClientReportPdf(report, await agencyBrand(link.client.agencyId), { internal: false, executiveSummary: await getExecutiveSummary(report, { generate: true }) });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(report.client.name)}-report-${report.range.from}-to-${report.range.to}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
