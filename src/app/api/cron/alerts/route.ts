import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { runAllAlerts } from "@/server/alerts";

// Alerts and daily summaries only. /api/cron/sync already runs these after syncing,
// so call this separately only if you schedule syncing elsewhere.
export const maxDuration = 300;

async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ agencies: await runAllAlerts() });
}

export const GET = run;
export const POST = run;
