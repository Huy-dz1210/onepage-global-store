"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { simulateTopup, startTopup } from "@/app/actions";
import { SHOP_CURRENCIES } from "@/lib/currency";
import { formatMoney } from "@/lib/fx";
import { LOCAL_RECEIVING_ACCOUNTS } from "@/lib/mock/accounts";

type Method = "WALLET" | "CARD" | "BANK_TRANSFER";
type Prov = "PINGPONG" | "PAYONEER" | "WORLDFIRST";

const PRESETS: Record<string, number[]> = {
  USD: [20, 50, 100, 250],
  EUR: [20, 50, 100, 250],
  GBP: [20, 50, 100, 200],
  JPY: [3000, 5000, 10000, 30000],
  AUD: [30, 75, 150, 400],
  CAD: [30, 75, 150, 350],
  SGD: [30, 75, 150, 350],
};

const PROVIDERS: { id: Prov; label: string; dot: string }[] = [
  { id: "PINGPONG", label: "PingPong", dot: "bg-red-500" },
  { id: "PAYONEER", label: "Payoneer", dot: "bg-orange-500" },
  { id: "WORLDFIRST", label: "WorldFirst", dot: "bg-blue-600" },
];

export function TopupForm({ defaultCurrency, defaultAmount, balances }: { defaultCurrency: string; defaultAmount?: number; balances: Record<string, number> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [currency, setCurrency] = useState(defaultCurrency);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [method, setMethod] = useState<Method>("CARD");
  const [provider, setProvider] = useState<Prov>("PINGPONG");
  const [error, setError] = useState<string | null>(null);
  const bank = LOCAL_RECEIVING_ACCOUNTS[currency];
  const value = Number(amount) || 0;
  const balance = balances[currency] ?? 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await startTopup({ currency, amount: value, method, provider: method === "WALLET" ? provider : undefined });
      if (r.ok) router.push(`/pay/${r.txId}`);
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Nạp vào ví</h2>
          <div className="flex flex-wrap gap-2">
            {SHOP_CURRENCIES.map((c) => (
              <button type="button" key={c.code} onClick={() => { setCurrency(c.code); setAmount(""); }} className={`rounded-full border px-3 py-1 text-sm ${currency === c.code ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>
                {c.flag} {c.code}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Số tiền</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(PRESETS[currency] ?? []).map((v) => (
              <button type="button" key={v} onClick={() => setAmount(String(v))} className={`rounded-xl border py-3 text-sm font-medium ${value === v ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-300 bg-white hover:border-stone-500"}`}>
                {formatMoney(v, currency)}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs">
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Số tiền khác" className="w-full rounded-lg border border-stone-300 py-2.5 pr-14 pl-3 text-lg outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900" />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-stone-500">{currency}</span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Phương thức</h2>
          <div className="space-y-2">
            <Option active={method === "CARD"} onClick={() => setMethod("CARD")} title="Thẻ Visa / Mastercard / JCB" hint="Tức thì • có thể yêu cầu xác thực 3-D Secure" />
            <Option active={method === "WALLET"} onClick={() => setMethod("WALLET")} title="Ví PingPong / Payoneer / WorldFirst" hint="Tức thì • xác nhận bằng OTP">
              {method === "WALLET" && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PROVIDERS.map((p) => (
                    <button type="button" key={p.id} onClick={(e) => { e.stopPropagation(); setProvider(p.id); }} className={`flex items-center justify-center gap-2 rounded-lg border bg-white py-2 text-sm font-medium ${provider === p.id ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-300"}`}>
                      <span className={`size-2.5 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </Option>
            <Option active={method === "BANK_TRANSFER"} disabled={!bank} onClick={() => bank && setMethod("BANK_TRANSFER")} title={`Chuyển khoản ${currency} nội địa`} hint={bank ? `${bank.rail} • ${bank.eta}` : "Chưa hỗ trợ loại tiền này"} />
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-3 rounded-xl border border-stone-200 bg-white p-5 lg:sticky lg:top-24">
        <h2 className="text-sm font-semibold">Tóm tắt</h2>
        <Line k="Số tiền nạp" v={formatMoney(value, currency)} />
        <Line k="Phí nạp" v={formatMoney(0, currency)} />
        <Line k="Ví nhận được" v={formatMoney(value, currency)} bold />
        <div className="space-y-1 rounded-lg bg-stone-50 p-3 text-sm">
          <Line k="Số dư hiện tại" v={formatMoney(balance, currency)} />
          <Line k="Số dư sau khi nạp" v={formatMoney(balance + value, currency)} bold />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={pending || value <= 0} className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-50">
          {pending ? "Đang tạo phiên thanh toán…" : "Tiếp tục thanh toán →"}
        </button>
        <p className="text-center text-xs text-stone-500">Bạn sẽ được chuyển sang trang thanh toán bảo mật.</p>
      </aside>
    </form>
  );
}

function Option({ active, onClick, title, hint, disabled, children }: { active: boolean; onClick: () => void; title: string; hint: string; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div onClick={disabled ? undefined : onClick} className={`cursor-pointer rounded-xl border p-4 ${disabled ? "cursor-not-allowed opacity-40" : ""} ${active ? "border-stone-900 bg-white ring-1 ring-stone-900" : "border-stone-300 bg-white hover:border-stone-500"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-4 place-items-center rounded-full border ${active ? "border-stone-900" : "border-stone-400"}`}>{active && <span className="size-2 rounded-full bg-stone-900" />}</span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-xs text-stone-500">{hint}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-semibold" : "text-stone-600"}`}>
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}

export function SimulateTopup({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => simulateTopup(id))} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
      {pending ? "Đang gửi…" : "Giả lập: tôi đã chuyển khoản"}
    </button>
  );
}
