import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { syncDueAccounts } from "@/server/sync/sync-account";
import { runAllAlerts } from "@/server/alerts";
import { sendDueScheduledReports } from "@/server/scheduled-reports";

// Scheduled entry point. Call hourly with  Authorization: Bearer $CRON_SECRET
// (Vercel Cron sends this header automatically when CRON_SECRET is set).
// Syncs due accounts, then evaluates alerts and sends any due daily summaries
// and scheduled client reports.
export const maxDuration = 300;

async function run(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await syncDueAccounts();
  const count = (s: string) => results.filter((r) => r.status === s).length;
  let alerts: unknown;
  try {
    alerts = await runAllAlerts();
  } catch (e) {
    alerts = { error: (e as Error).message };
  }
  let scheduledReports: unknown;
  try {
    scheduledReports = await sendDueScheduledReports();
  } catch (e) {
    scheduledReports = { error: (e as Error).message };
  }
  return NextResponse.json({
    scheduledReports,
    synced: results.length,
    succeeded: count("SUCCEEDED"),
    partial: count("PARTIAL"),
    failed: count("FAILED"),
    skipped: count("SKIPPED"),
    failures: results.filter((r) => r.status === "FAILED" || r.status === "PARTIAL").map((r) => ({ accountId: r.accountId, error: r.error })),
    alerts,
  });
}

export const GET = run;
export const POST = run;
