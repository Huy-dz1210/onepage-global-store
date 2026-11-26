"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { simulateTransfer } from "@/app/actions";

/** Tự refresh trang theo chu kỳ (server components lấy dữ liệu mới) */
export function AutoRefresh({ ms = 3000, enabled = true }: { ms?: number; enabled?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [router, ms, enabled]);
  return null;
}

export function SimulateTransfer({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        disabled={pending}
        onClick={() => start(() => simulateTransfer(orderId))}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Đang gửi…" : "Sandbox: giả lập khách chuyển đủ tiền"}
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => simulateTransfer(orderId, true))}
        className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:border-stone-900 disabled:opacity-60"
      >
        Chuyển thiếu 50%
      </button>
    </div>
  );
}
