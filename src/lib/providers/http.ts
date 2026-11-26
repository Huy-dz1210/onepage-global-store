import { ProviderError } from "./types";

/** fetch JSON có retry/backoff cho lỗi 429/5xx/network */
export async function requestJson<T = unknown>(
  url: string,
  init: RequestInit & { retries?: number; allowStatus?: number[] } = {},
): Promise<{ status: number; body: T }> {
  const retries = init.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      const body = text ? JSON.parse(text) : null;
      if (res.ok || init.allowStatus?.includes(res.status)) return { status: res.status, body };
      if (res.status !== 429 && res.status < 500) throw new ProviderError(`HTTP ${res.status}`, res.status, body);
      lastErr = new ProviderError(`HTTP ${res.status}`, res.status, body);
    } catch (e) {
      if (e instanceof ProviderError && e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(String(lastErr));
}

/** Chia khoảng thời gian thành các cửa sổ ≤ maxDays (API thường giới hạn range) */
export function* windows(from: Date, to: Date, maxDays: number) {
  const step = maxDays * 86400000;
  for (let s = from.getTime(); s < to.getTime(); s += step) {
    yield [new Date(s), new Date(Math.min(s + step, to.getTime()))] as const;
  }
}
