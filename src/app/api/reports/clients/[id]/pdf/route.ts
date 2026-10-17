import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { userCanViewClient } from "@/server/access";
import { loadClientReport } from "@/server/client-report";
import { renderClientReportPdf } from "@/server/pdf/reports";
import { getExecutiveSummary } from "@/server/exec-summary";
import { agencyBrand } from "@/server/pdf/brand";
import { slug } from "@/lib/csv";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await userCanViewClient(user, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = Object.fromEntries(req.nextUrl.searchParams);
  const report = await loadClientReport(id, q);
  // Internal recommendations only for agency staff who ask for them.
  const internal = user.role !== "CLIENT_USER" && q.internal === "1";
  const pdf = await renderClientReportPdf(report, await agencyBrand(user.agencyId), { internal, executiveSummary: await getExecutiveSummary(report, { generate: true }) });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(report.client.name)}-report-${report.range.from}-to-${report.range.to}${internal ? "-internal" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
