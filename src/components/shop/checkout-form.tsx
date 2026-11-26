"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { placeOrder } from "@/app/actions";
import { shippingFor, type ShopCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/fx";
import { LOCAL_RECEIVING_ACCOUNTS } from "@/lib/mock/accounts";
import { useCart } from "./cart";

type Method = "STORE_WALLET" | "WALLET" | "CARD" | "BANK_TRANSFER";
type WalletProvider = "PINGPONG" | "PAYONEER" | "WORLDFIRST";

const WALLETS: { id: WalletProvider; label: string; dot: string }[] = [
  { id: "PINGPONG", label: "PingPong", dot: "bg-red-500" },
  { id: "PAYONEER", label: "Payoneer", dot: "bg-orange-500" },
  { id: "WORLDFIRST", label: "WorldFirst", dot: "bg-blue-600" },
];

const COUNTRIES: Record<string, string[]> = {
  USD: ["United States"],
  EUR: ["Germany", "France", "Netherlands", "Italy", "Spain"],
  GBP: ["United Kingdom"],
  JPY: ["Japan"],
  AUD: ["Australia"],
  CAD: ["Canada"],
  SGD: ["Singapore"],
};

const TEST_CARDS = [
  { n: "4242 4242 4242 4242", d: "Thành công" },
  { n: "4000 0000 0000 0002", d: "Bị từ chối" },
  { n: "4000 0000 0000 9995", d: "Không đủ tiền" },
];

const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900";

export function CheckoutForm({ user, walletBalance }: { user: { name: string; email: string }; walletBalance: number }) {
  const { lines, subtotal, currency, clear } = useCart();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<number | undefined>();
  const [orderId, setOrderId] = useState<string | undefined>();

  const [method, setMethod] = useState<Method>(walletBalance > 0 ? "STORE_WALLET" : "WALLET");
  const [wallet, setWallet] = useState<WalletProvider>("PINGPONG");
  const [otpSent, setOtpSent] = useState(false);
  const [f, setF] = useState({
    email: user.email,
    name: user.name,
    country: COUNTRIES[currency]?.[0] ?? "",
    address: "",
    card: "",
    expiry: "",
    cvc: "",
    walletAccount: "",
    otp: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const shipping = shippingFor(currency as ShopCurrency, subtotal);
  const total = subtotal + shipping;
  const bank = LOCAL_RECEIVING_ACCOUNTS[currency];

  if (lines.length === 0 && !pending) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 p-10 text-center">
        <p className="text-stone-600">Giỏ hàng trống.</p>
        <Link href="/" className="mt-3 inline-block text-sm font-medium underline">Tiếp tục mua sắm</Link>
      </div>
    );
  }

  function fillDemo() {
    setF({
      ...f,
      address: "221B Baker Street, London",
      card: "4242 4242 4242 4242",
      expiry: "12/29",
      cvc: "123",
      walletAccount: f.email,
      otp: "123456",
    });
    setOtpSent(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShortfall(undefined);
    start(async () => {
      const payment =
        method === "STORE_WALLET"
          ? { method: "STORE_WALLET" as const }
          : method === "CARD"
          ? { method: "CARD" as const, card: { number: f.card, expiry: f.expiry, cvc: f.cvc, holder: f.name } }
          : method === "WALLET"
            ? { method: "WALLET" as const, provider: wallet, wallet: { account: f.walletAccount || f.email, otp: f.otp } }
            : { method: "BANK_TRANSFER" as const };
      const res = await placeOrder({
        orderId,
        currency,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customer: { email: f.email, name: f.name, country: f.country, address: f.address },
        payment,
      });
      if (res.ok) {
        clear();
        router.push(`/orders/${res.orderId}`);
      } else {
        setOrderId(res.orderId);
        setError(res.error);
        if ("shortfall" in res) setShortfall(res.shortfall);
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Thanh toán</h1>
          <button type="button" onClick={fillDemo} className="text-sm text-stone-500 underline hover:text-stone-900">
            Điền dữ liệu demo
          </button>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">Liên hệ & giao hàng</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <input required type="email" placeholder="Email" value={f.email} onChange={set("email")} className={input} />
            <input required placeholder="Họ tên" value={f.name} onChange={set("name")} className={input} />
            <select value={f.country} onChange={set("country")} className={input}>
              {(COUNTRIES[currency] ?? ["Other"]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input required placeholder="Địa chỉ" value={f.address} onChange={set("address")} className={input} />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Phương thức thanh toán</legend>
          <div className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {/* Store wallet */}
            <MethodRow
              active={method === "STORE_WALLET"}
              onSelect={() => setMethod("STORE_WALLET")}
              title={`Số dư ví ${currency} của bạn`}
              hint={`${formatMoney(walletBalance, currency)} • 0 phí`}
            >
              {walletBalance >= total ? (
                <p className="text-sm text-stone-600">
                  Trừ <b>{formatMoney(total, currency)}</b> từ ví – còn lại <b>{formatMoney(walletBalance - total, currency)}</b>. Xác nhận tức thì.
                </p>
              ) : (
                <p className="text-sm text-stone-600">
                  Ví còn thiếu <b>{formatMoney(total - walletBalance, currency)}</b>.{" "}
                  <Link href={`/account/wallet/topup?currency=${currency}&amount=${Math.ceil(total - walletBalance)}`} className="font-medium underline">Nạp thêm</Link> rồi quay lại, hoặc chọn cách khác bên dưới.
                </p>
              )}
            </MethodRow>

            {/* Wallet */}
            <MethodRow active={method === "WALLET"} onSelect={() => setMethod("WALLET")} title="Ví điện tử" hint="1 chạm • phí 0.5%">
              <div className="grid grid-cols-3 gap-2">
                {WALLETS.map((w) => (
                  <button
                    type="button"
                    key={w.id}
                    onClick={() => setWallet(w.id)}
                    className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium ${wallet === w.id ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-300"}`}
                  >
                    <span className={`size-2.5 rounded-full ${w.dot}`} />
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_140px]">
                <input placeholder={`Tài khoản ${WALLETS.find((w) => w.id === wallet)?.label} (email)`} value={f.walletAccount} onChange={set("walletAccount")} className={input} />
                <button type="button" onClick={() => setOtpSent(true)} className="rounded-lg border border-stone-300 px-3 text-sm hover:border-stone-900">
                  {otpSent ? "Gửi lại OTP" : "Gửi OTP"}
                </button>
                <input placeholder="OTP" value={f.otp} onChange={set("otp")} className={input} inputMode="numeric" />
              </div>
              {otpSent && <p className="mt-2 text-xs text-stone-500">Demo: OTP luôn là <b>123456</b>.</p>}
            </MethodRow>

            {/* Card */}
            <MethodRow active={method === "CARD"} onSelect={() => setMethod("CARD")} title="Thẻ quốc tế" hint="Visa / Mastercard / Amex • phí 2.5%">
              <div className="grid gap-3 sm:grid-cols-[1fr_100px_80px]">
                <input placeholder="Số thẻ" value={f.card} onChange={set("card")} className={input} inputMode="numeric" autoComplete="cc-number" />
                <input placeholder="MM/YY" value={f.expiry} onChange={set("expiry")} className={input} autoComplete="cc-exp" />
                <input placeholder="CVC" value={f.cvc} onChange={set("cvc")} className={input} autoComplete="cc-csc" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {TEST_CARDS.map((c) => (
                  <button key={c.n} type="button" onClick={() => setF({ ...f, card: c.n, expiry: f.expiry || "12/29", cvc: f.cvc || "123" })} className="rounded border border-dashed border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600 hover:border-stone-900">
                    {c.n.slice(-4)} · {c.d}
                  </button>
                ))}
              </div>
            </MethodRow>

            {/* Bank transfer */}
            <MethodRow
              active={method === "BANK_TRANSFER"}
              onSelect={() => setMethod("BANK_TRANSFER")}
              title={`Chuyển khoản ${currency} nội địa`}
              hint={bank ? `${bank.rail} • 0 phí` : "Không hỗ trợ"}
              disabled={!bank}
            >
              {bank && (
                <p className="text-sm text-stone-600">
                  Bạn chuyển khoản <b>{currency}</b> tới tài khoản local tại <b>{bank.bank}</b> ({bank.eta}). Thông tin tài khoản và nội dung chuyển khoản hiển thị sau khi đặt hàng; đơn tự xác nhận khi tiền về.
                </p>
              )}
            </MethodRow>
          </div>
        </fieldset>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error} {orderId && "Bạn có thể chọn cách khác và thử lại."}{" "}
            {shortfall && <Link href={`/account/wallet/topup?currency=${currency}&amount=${Math.ceil(shortfall)}`} className="font-medium underline">Nạp {formatMoney(Math.ceil(shortfall), currency)}</Link>}
          </p>
        )}
      </div>

      <aside className="h-fit space-y-4 rounded-xl border border-stone-200 bg-white p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold">Đơn hàng ({currency})</h2>
        <ul className="space-y-3">
          {lines.map((l) => (
            <li key={l.productId} className="flex items-center gap-3 text-sm">
              <Image src={l.product.image} alt="" width={44} height={44} className="rounded-md" />
              <span className="flex-1">
                {l.product.name} <span className="text-stone-500">× {l.quantity}</span>
              </span>
              <span className="tabular">{formatMoney(l.product.price * l.quantity, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between text-stone-600"><span>Tạm tính</span><span className="tabular">{formatMoney(subtotal, currency)}</span></div>
          <div className="flex justify-between text-stone-600"><span>Vận chuyển</span><span className="tabular">{shipping ? formatMoney(shipping, currency) : "Miễn phí"}</span></div>
          <div className="flex justify-between pt-1 text-base font-semibold"><span>Tổng</span><span className="tabular">{formatMoney(total, currency)}</span></div>
        </div>
        <button disabled={pending} className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-60">
          {pending ? "Đang xử lý…" : method === "STORE_WALLET" ? `Trả ${formatMoney(total, currency)} bằng ví` : method === "BANK_TRANSFER" ? "Đặt hàng & lấy thông tin CK" : `Thanh toán ${formatMoney(total, currency)}`}
        </button>
        <p className="text-center text-xs text-stone-500">Bạn trả đúng {currency}, người bán nhận đúng {currency} – không quy đổi.</p>
      </aside>
    </form>
  );
}

function MethodRow({
  active,
  onSelect,
  title,
  hint,
  disabled,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <input type="radio" checked={active} onChange={onSelect} disabled={disabled} className="accent-stone-900" />
        <span className="flex-1 text-sm font-medium">{title}</span>
        <span className="text-xs text-stone-500">{hint}</span>
      </label>
      {active && !disabled && <div className="bg-stone-50 px-4 pt-1 pb-4">{children}</div>}
    </div>
  );
}
