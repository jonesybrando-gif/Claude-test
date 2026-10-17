import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { visibleClientsWhere } from "@/server/access";
import { agencyPacingCsv } from "@/server/exports";
import { canViewAgencyDashboard } from "@/lib/access";
import { todayInTimeZone } from "@/lib/pacing/dates";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canViewAgencyDashboard(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const csv = await agencyPacingCsv(visibleClientsWhere(user));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-pacing-${todayInTimeZone("UTC")}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
