export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SYNC_SCHEDULER_ENABLED !== "false" && !process.env.VERCEL) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
