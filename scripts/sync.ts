/**
 * Command-line sync, for running from cron or by hand:
 *   npm run sync                      # all accounts due for a scheduled sync
 *   npm run sync -- --account <id>    # one account
 *   npm run sync -- --account <id> --backfill   # re-import full history
 */
import "dotenv/config";
import { syncAccount, syncDueAccounts } from "../src/server/sync/sync-account";
import { prisma } from "../src/server/db";

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--account");
  const results = i >= 0 ? [await syncAccount(args[i + 1], args.includes("--backfill") ? "backfill" : "manual")] : await syncDueAccounts();
  for (const r of results) console.log(`${r.status.padEnd(9)} ${r.accountId} rows=${r.rowsUpserted}${r.range ? ` ${r.range.from}..${r.range.to}` : ""}${r.error ? ` — ${r.error}` : ""}`);
  if (results.length === 0) console.log("No accounts due for sync.");
  if (results.some((r) => r.status === "FAILED")) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
