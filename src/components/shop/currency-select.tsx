"use client";

import { useTransition } from "react";
import { setCurrency } from "@/app/actions";
import { SHOP_CURRENCIES } from "@/lib/currency";

export function CurrencySelect({ value }: { value: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="relative">
      <span className="sr-only">Tiền tệ</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => start(() => setCurrency(e.target.value))}
        className="cursor-pointer appearance-none rounded-full border border-stone-200 bg-white py-1.5 pr-8 pl-3 text-sm hover:border-stone-300 disabled:opacity-50"
      >
        {SHOP_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-stone-400">▾</span>
    </label>
  );
}
