import "server-only";
import { syncDueAccounts } from "./sync/sync-account";
import { runAllAlerts } from "./alerts";
import { sendDueScheduledReports } from "./scheduled-reports";

// Built-in hourly job for hosts that keep the app running (Railway, Render,
// a VPS). Does the same work as GET /api/cron/sync, so no external scheduler
// is needed. Turned on with INTERNAL_SCHEDULER=1; run only one app instance
// with it on.

const HOUR = 3_600_000;
let running = false;

async function tick() {
  if (running) return; // the previous run is still going
  running = true;
  const started = Date.now();
  try {
    const results = await syncDueAccounts();
    const failed = results.filter((r) => r.status === "FAILED").length;
    await runAllAlerts();
    const reports = await sendDueScheduledReports();
    console.log(`[scheduler] synced ${results.length} account(s), ${failed} failed, alerts checked, ${reports.length} scheduled report(s) sent (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (e) {
    console.error("[scheduler] run failed", e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  const g = globalThis as { __pmScheduler?: boolean };
  if (g.__pmScheduler) return;
  g.__pmScheduler = true;
  console.log("[scheduler] hourly sync on");
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), HOUR);
  }, 60_000); // first run a minute after start-up
}
