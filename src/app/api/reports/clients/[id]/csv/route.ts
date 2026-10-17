import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { userCanViewClient } from "@/server/access";
import { loadClientReport } from "@/server/client-report";
import { clientDailyCsv } from "@/server/exports";
import { slug } from "@/lib/csv";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await userCanViewClient(user, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = Object.fromEntries(req.nextUrl.searchParams);
  const report = await loadClientReport(id, q);
  const csv = await clientDailyCsv(id, report.range);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(report.client.name)}-daily-${report.range.from}-to-${report.range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
