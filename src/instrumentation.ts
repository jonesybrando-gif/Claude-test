// Runs once when the server starts (Next.js instrumentation hook). The
// runtime check must wrap the import directly so edge bundles leave it out.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.INTERNAL_SCHEDULER === "1") {
      const { startScheduler } = await import("./server/scheduler");
      startScheduler();
    }
  }
}
