"use client";

import { useTransition } from "react";
import { syncNow, toggleAccount } from "@/app/actions";

export function SyncButton({ accountId, label = "Sync ngay" }: { accountId?: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => syncNow(accountId))}
      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:border-stone-900 disabled:opacity-60"
    >
      {pending ? "Đang sync…" : label}
    </button>
  );
}

export function ToggleAccount({ accountId, enabled }: { accountId: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => toggleAccount(accountId, !enabled))}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}
    >
      {enabled ? "Đang bật" : "Đã tắt"}
    </button>
  );
}
