import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { visibleClientsWhere } from "@/server/access";
import { loadPacing, summarize } from "@/server/pacing-service";
import { renderAgencyReportPdf } from "@/server/pdf/reports";
import { agencyBrand } from "@/server/pdf/brand";
import { canViewAgencyDashboard } from "@/lib/access";
import { todayInTimeZone } from "@/lib/pacing/dates";

export const maxDuration = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canViewAgencyDashboard(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const clients = await loadPacing(visibleClientsWhere(user));
  const brand = await agencyBrand(user.agencyId);
  const pdf = await renderAgencyReportPdf(clients, summarize(clients), brand, { timezone: brand.timezone });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="budget-pacing-${todayInTimeZone(brand.timezone)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
