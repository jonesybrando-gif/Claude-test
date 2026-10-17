import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncDueAccounts } from "@/server/sync/sync-account";

// Scheduled sync entry point. Call hourly from a scheduler with
//   Authorization: Bearer $CRON_SECRET
// (Vercel Cron sends this header automatically when CRON_SECRET is set.)
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await syncDueAccounts();
  const count = (s: string) => results.filter((r) => r.status === s).length;
  return NextResponse.json({
    synced: results.length,
    succeeded: count("SUCCEEDED"),
    partial: count("PARTIAL"),
    failed: count("FAILED"),
    skipped: count("SKIPPED"),
    failures: results.filter((r) => r.status === "FAILED" || r.status === "PARTIAL").map((r) => ({ accountId: r.accountId, error: r.error })),
  });
}

export const GET = run;
export const POST = run;
