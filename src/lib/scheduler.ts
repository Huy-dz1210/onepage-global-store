import { syncAll } from "./sync";

const g = globalThis as unknown as { __syncTimer?: NodeJS.Timeout; __nextSyncAt?: number };

export function intervalMinutes() {
  return Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES ?? 30));
}

export function nextSyncAt() {
  return g.__nextSyncAt ?? null;
}

export function startScheduler() {
  if (g.__syncTimer) return;
  const ms = intervalMinutes() * 60000;
  const tick = async () => {
    g.__nextSyncAt = Date.now() + ms;
    try {
      const r = await syncAll("schedule");
      console.log(`[sync] ${new Date().toISOString()}`, r.map((x) => `${x.account}: ${x.ok ? "ok" : "FAIL"}`).join(" | "));
    } catch (e) {
      console.error("[sync] error", e);
    }
  };
  // chạy lần đầu sau 15s (đợi server sẵn sàng để gọi mock API)
  g.__nextSyncAt = Date.now() + 15000;
  setTimeout(tick, 15000);
  g.__syncTimer = setInterval(tick, ms);
  console.log(`[sync] scheduler started – mỗi ${intervalMinutes()} phút`);
}
