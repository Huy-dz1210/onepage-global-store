"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cancelTopupPayment, confirmTopupPayment, simulateTopup, startTopup } from "@/app/actions";
import { formatMoney } from "@/lib/fx";

type Tx = {
  id: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  method: "CARD" | "WALLET" | "BANK_TRANSFER";
  provider: string | null;
  amount: number;
  currency: string;
  reference: string;
  externalRef: string | null;
  description: string;
  failReason: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  balanceBefore: number;
  balanceAfter: number | null;
};

type Bank = { bank: string; holder: string; rail: string; eta: string; fields: { label: string; value: string }[] } | null;

const PROVIDER_LABEL: Record<string, string> = { PINGPONG: "PingPong", PAYONEER: "Payoneer", WORLDFIRST: "WorldFirst" };
const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900";

export function HostedCheckout({ tx, user, bank }: { tx: Tx; user: { name: string; email: string }; bank: Bank }) {
  return (
    <div className="space-y-4">
      <Header tx={tx} />
      {tx.status === "COMPLETED" && <Receipt tx={tx} />}
      {(tx.status === "FAILED" || tx.status === "CANCELLED") && <Failed tx={tx} />}
      {tx.status === "PENDING" && tx.method === "CARD" && <CardStep tx={tx} user={user} />}
      {tx.status === "PENDING" && tx.method === "WALLET" && <WalletStep tx={tx} user={user} />}
      {tx.status === "PENDING" && tx.method === "BANK_TRANSFER" && <BankStep tx={tx} bank={bank} />}
      <p className="text-center text-xs text-stone-400">🔒 Kết nối mã hóa • Onepage Pay (sandbox){tx.provider ? ` • xử lý qua ${PROVIDER_LABEL[tx.provider]}` : ""}</p>
    </div>
  );
}

/* ───────────────────────── header ───────────────────────── */

function Header({ tx }: { tx: Tx }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">
          onepage<span className="text-emerald-600">.</span>pay
        </span>
        {tx.status === "PENDING" && tx.method !== "BANK_TRANSFER" && <Countdown until={tx.expiresAt} />}
      </div>
      <p className="mt-4 text-xs text-stone-500">Nạp tiền vào ví {tx.currency} • onepage.store</p>
      <p className="tabular text-3xl font-semibold tracking-tight">{formatMoney(tx.amount, tx.currency)}</p>
      <p className="mt-1 font-mono text-xs text-stone-400">Mã giao dịch: {tx.reference}</p>
    </div>
  );
}

function Countdown({ until }: { until: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = new Date(until).getTime() - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0) router.refresh();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until, router]);
  if (left === null) return <span className="text-xs text-stone-400">--:--</span>;
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return (
    <span className={`tabular rounded-full px-2 py-0.5 text-xs ${left < 120000 ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>
      Hết hạn sau {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

/* ───────────────────────── processing overlay ───────────────────────── */

const STEPS = ["Đang kết nối cổng thanh toán", "Đang xác thực & ủy quyền", "Đang ghi có vào ví"];

function useProcessing() {
  const [step, setStep] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const begin = () => {
    setStep(0);
    timer.current = setInterval(() => setStep((s) => (s !== null && s < STEPS.length - 2 ? s + 1 : s)), 700);
  };
  const end = async (success: boolean) => {
    if (timer.current) clearInterval(timer.current);
    if (success) {
      setStep(STEPS.length - 1);
      await new Promise((r) => setTimeout(r, 700));
    }
    setStep(null);
  };
  return { step, begin, end };
}

function Processing({ step }: { step: number | null }) {
  if (step === null) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 backdrop-blur-sm">
      <div className="w-80 rounded-2xl bg-white p-6 shadow-xl">
        <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-4 border-stone-200 border-t-stone-900" />
        <ul className="space-y-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 ${i <= step ? "text-stone-900" : "text-stone-400"}`}>
              <span className="w-4 text-center">{i < step ? "✓" : i === step ? "•" : ""}</span>
              {s}…
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs text-stone-500">Vui lòng không đóng trang</p>
      </div>
    </div>
  );
}

/* ───────────────────────── card ───────────────────────── */

function brandOf(n: string) {
  return n.startsWith("4") ? "VISA" : /^5[1-5]|^2[2-7]/.test(n) ? "MASTERCARD" : /^3[47]/.test(n) ? "AMEX" : /^35/.test(n) ? "JCB" : "";
}

const TEST_CARDS = [
  ["4242 4242 4242 4242", "Thành công"],
  ["4000 0027 6000 3184", "Yêu cầu 3-D Secure"],
  ["4000 0000 0000 0002", "Bị từ chối"],
  ["4000 0000 0000 9995", "Không đủ tiền"],
];

function CardStep({ tx, user }: { tx: Tx; user: { name: string } }) {
  const router = useRouter();
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", holder: user.name.toUpperCase() });
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ last4: string; brand: string; error?: string } | null>(null);
  const { step, begin, end } = useProcessing();
  const digits = card.number.replace(/\D/g, "");
  const brand = brandOf(digits);

  async function pay(threeDsCode?: string) {
    setError(null);
    begin();
    const r = await confirmTopupPayment(tx.id, { method: "CARD", card, threeDsCode });
    if (r.status === "REQUIRES_3DS") {
      await end(false);
      setChallenge({ last4: r.last4, brand: r.brand, error: r.error });
      return;
    }
    if (r.status === "ERROR") {
      await end(false);
      setError(r.error);
      return;
    }
    setChallenge(null);
    await end(r.status === "COMPLETED");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <Processing step={step} />
      {challenge && (
        <ThreeDS
          amount={formatMoney(tx.amount, tx.currency)}
          last4={challenge.last4}
          brand={challenge.brand}
          error={challenge.error}
          onSubmit={(code) => pay(code)}
          onCancel={async () => {
            setChallenge(null);
            await cancelTopupPayment(tx.id);
            router.refresh();
          }}
        />
      )}
      <h2 className="text-sm font-semibold">Thông tin thẻ</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pay();
        }}
        className="space-y-3"
      >
        <div className="relative">
          <input
            required
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 1234 1234 1234"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ") })}
            className={`${input} pr-24 font-mono`}
          />
          {brand && <span className="absolute top-1/2 right-3 -translate-y-1/2 rounded bg-stone-900 px-1.5 py-0.5 text-[10px] font-bold text-white">{brand}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="MM/YY"
            autoComplete="cc-exp"
            inputMode="numeric"
            value={card.expiry}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 4);
              setCard({ ...card, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
            }}
            className={`${input} font-mono`}
          />
          <input required placeholder="CVC" autoComplete="cc-csc" inputMode="numeric" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={`${input} font-mono`} />
        </div>
        <input required placeholder="Tên in trên thẻ" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value.toUpperCase() })} className={input} />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={step !== null} className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-60">
          Thanh toán {formatMoney(tx.amount, tx.currency)}
        </button>
      </form>
      <details className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-3 text-xs">
        <summary className="cursor-pointer font-medium text-amber-900">Thẻ test (sandbox)</summary>
        <div className="mt-2 space-y-1">
          {TEST_CARDS.map(([n, d]) => (
            <button key={n} type="button" onClick={() => setCard({ ...card, number: n, expiry: "12/30", cvc: "123" })} className="flex w-full justify-between rounded px-2 py-1 text-left hover:bg-amber-100">
              <span className="font-mono">{n}</span>
              <span className="text-stone-600">{d}</span>
            </button>
          ))}
          <p className="pt-1 text-stone-600">Nạp từ 100 USD trở lên luôn yêu cầu 3-D Secure. Mã OTP sandbox: 123456.</p>
        </div>
      </details>
      <CancelLink id={tx.id} />
    </div>
  );
}

function ThreeDS({ amount, last4, brand, error, onSubmit, onCancel }: { amount: string; last4: string; brand: string; error?: string; onSubmit: (code: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(120);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-stone-900/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between bg-stone-900 px-5 py-3 text-white">
          <span className="text-sm font-semibold">Xác thực giao dịch</span>
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold">{brand} SECURE</span>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <p className="text-stone-600">Ngân hàng phát hành thẻ (sandbox) cần xác nhận đây là bạn.</p>
          <dl className="space-y-1 rounded-lg bg-stone-50 p-3">
            <div className="flex justify-between"><dt className="text-stone-500">Đơn vị nhận</dt><dd>ONEPAGE STORE</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Số tiền</dt><dd className="font-semibold">{amount}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Thẻ</dt><dd className="font-mono">•••• {last4}</dd></div>
          </dl>
          <p>Nhập mã OTP 6 số đã gửi tới số điện thoại <b>•••• ••• 489</b>.</p>
          <input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} text-center font-mono text-lg tracking-[0.5em]`} placeholder="••••••" />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span className="tabular">Mã hết hạn sau {left}s</span>
            <button type="button" onClick={() => { setLeft(120); setSent(true); }} className="underline">Gửi lại mã</button>
          </div>
          {sent && <p className="text-xs text-emerald-700">Đã gửi lại mã.</p>}
          <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Sandbox: OTP là 123456</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-stone-300 py-2.5">Hủy</button>
            <button type="button" disabled={code.length !== 6 || left === 0} onClick={() => onSubmit(code)} className="rounded-lg bg-stone-900 py-2.5 font-medium text-white disabled:opacity-50">Xác nhận</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── wallet ───────────────────────── */

function WalletStep({ tx, user }: { tx: Tx; user: { email: string } }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"account" | "otp">("account");
  const [account, setAccount] = useState(user.email);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { step, begin, end } = useProcessing();
  const label = PROVIDER_LABEL[tx.provider ?? ""] ?? "ví";

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await new Promise((r) => setTimeout(r, 700));
    setSending(false);
    setPhase("otp");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    begin();
    const r = await confirmTopupPayment(tx.id, { method: "WALLET", wallet: { account, otp } });
    if (r.status === "ERROR") {
      await end(false);
      setError(r.error);
      return;
    }
    await end(r.status === "COMPLETED");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <Processing step={step} />
      <div className="flex items-center gap-3">
        <span className={`grid size-10 place-items-center rounded-full text-sm font-bold text-white ${tx.provider === "PINGPONG" ? "bg-red-500" : tx.provider === "PAYONEER" ? "bg-orange-500" : "bg-blue-600"}`}>
          {label[0]}
        </span>
        <div>
          <p className="text-sm font-semibold">Thanh toán bằng ví {label}</p>
          <p className="text-xs text-stone-500">Kết nối sandbox – không dùng mật khẩu thật</p>
        </div>
      </div>

      {phase === "account" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone-500">Email tài khoản {label}</span>
            <input required type="email" value={account} onChange={(e) => setAccount(e.target.value)} className={input} />
          </label>
          <button disabled={sending} className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white disabled:opacity-60">
            {sending ? "Đang gửi mã…" : "Gửi mã xác nhận"}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-sm">
            Mã xác nhận 6 số đã được gửi tới <b>{account}</b>. Nhập mã để cho phép trừ <b>{formatMoney(tx.amount, tx.currency)}</b> từ ví {label}.
          </p>
          <input autoFocus required inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="••••••" className={`${input} text-center font-mono text-lg tracking-[0.5em]`} />
          <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Sandbox: mã là 123456</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={otp.length !== 6 || step !== null} className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white disabled:opacity-60">
            Xác nhận thanh toán
          </button>
          <button type="button" onClick={() => setPhase("account")} className="w-full text-xs text-stone-500 underline">Đổi tài khoản ví</button>
        </form>
      )}
      <CancelLink id={tx.id} />
    </div>
  );
}

/* ───────────────────────── bank transfer ───────────────────────── */

function BankStep({ tx, bank }: { tx: Tx; bank: Bank }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [router]);
  if (!bank) return null;
  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Chuyển khoản {tx.currency} nội địa</h2>
        <span className="flex items-center gap-1.5 text-xs text-stone-500"><span className="size-2 animate-pulse rounded-full bg-amber-500" />Đang chờ tiền về</span>
      </div>
      <dl className="divide-y divide-stone-100 rounded-lg border border-stone-200 text-sm">
        <Copyable k="Ngân hàng" v={bank.bank} />
        <Copyable k="Chủ tài khoản" v={bank.holder} />
        {bank.fields.map((f) => <Copyable key={f.label} k={f.label} v={f.value} mono />)}
        <Copyable k="Số tiền" v={String(tx.amount)} display={formatMoney(tx.amount, tx.currency)} mono />
        <Copyable k="Nội dung (bắt buộc)" v={tx.reference} mono highlight />
      </dl>
      <p className="text-xs text-stone-500">
        Kênh {bank.rail} – {bank.eta}. Ví được cộng tự động ngay khi tiền về và khớp nội dung. Chuyển thiếu/thừa: ví được cộng đúng số tiền thực nhận.
      </p>
      <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3">
        <p className="mb-2 text-xs font-semibold text-blue-800 uppercase">Sandbox</p>
        <button disabled={pending} onClick={() => start(() => simulateTopup(tx.id))} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Ngân hàng đang xử lý…" : "Giả lập: tôi đã chuyển khoản"}
        </button>
      </div>
      <CancelLink id={tx.id} />
    </div>
  );
}

function Copyable({ k, v, display, mono, highlight }: { k: string; v: string; display?: string; mono?: boolean; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-stone-500">{k}</dt>
      <dd className="flex items-center gap-2 text-right">
        <span className={`${mono ? "font-mono" : ""} ${highlight ? "rounded bg-amber-100 px-1.5 font-semibold" : ""}`}>{display ?? v}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(v).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-xs text-stone-400 hover:text-stone-900"
        >
          {copied ? "✓" : "Sao chép"}
        </button>
      </dd>
    </div>
  );
}

/* ───────────────────────── kết quả ───────────────────────── */

function Receipt({ tx }: { tx: Tx }) {
  const fmt = (d: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" }).format(new Date(d));
  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm print:shadow-none">
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
        <h1 className="mt-3 text-lg font-semibold">Nạp tiền thành công</h1>
        <p className="tabular text-3xl font-semibold text-emerald-700">+{formatMoney(tx.amount, tx.currency)}</p>
      </div>
      <div className="flex items-center justify-center gap-3 rounded-lg bg-stone-50 py-3 text-sm">
        <span className="tabular text-stone-500">{formatMoney(tx.balanceBefore, tx.currency)}</span>
        <span>→</span>
        <span className="tabular font-semibold">{formatMoney(tx.balanceAfter ?? tx.balanceBefore + tx.amount, tx.currency)}</span>
        <span className="text-xs text-stone-500">số dư ví {tx.currency}</span>
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row k="Mã giao dịch" v={<span className="font-mono">{tx.reference}</span>} />
        <Row k="Mã cổng thanh toán" v={<span className="font-mono text-xs">{tx.externalRef ?? "—"}</span>} />
        <Row k="Phương thức" v={tx.description} />
        <Row k="Cổng xử lý" v={tx.provider ? PROVIDER_LABEL[tx.provider] : "—"} />
        <Row k="Phí" v={formatMoney(0, tx.currency)} />
        <Row k="Thời gian" v={tx.completedAt ? fmt(tx.completedAt) : "—"} />
      </dl>
      <div className="grid grid-cols-2 gap-2 print:hidden">
        <Link href="/account/wallet" className="rounded-lg bg-stone-900 py-2.5 text-center text-sm font-medium text-white">Về ví của tôi</Link>
        <Link href="/" className="rounded-lg border border-stone-300 py-2.5 text-center text-sm">Mua sắm ngay</Link>
        <Link href={`/account/wallet/${tx.id}`} className="py-1 text-center text-xs text-stone-500 underline">Chi tiết giao dịch</Link>
        <button onClick={() => window.print()} className="py-1 text-xs text-stone-500 underline">In / lưu biên lai</button>
      </div>
    </div>
  );
}

function Failed({ tx }: { tx: Tx }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const cancelled = tx.status === "CANCELLED";
  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 text-center shadow-sm">
      <div className={`mx-auto grid size-14 place-items-center rounded-full text-2xl ${cancelled ? "bg-stone-100 text-stone-500" : "bg-red-100 text-red-700"}`}>{cancelled ? "–" : "✕"}</div>
      <h1 className="text-lg font-semibold">{cancelled ? "Giao dịch đã hủy" : "Nạp tiền không thành công"}</h1>
      <p className="text-sm text-stone-600">{tx.failReason ?? "Giao dịch không được thực hiện."} Ví của bạn không bị trừ tiền.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await startTopup({ currency: tx.currency, amount: tx.amount, method: tx.method, provider: (tx.provider ?? undefined) as never });
              if (r.ok) router.push(`/pay/${r.txId}`);
            })
          }
          className="rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Đang tạo…" : "Thử lại"}
        </button>
        <Link href="/account/wallet/topup" className="rounded-lg border border-stone-300 py-2.5 text-sm">Chọn cách khác</Link>
      </div>
    </div>
  );
}

function CancelLink({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => { await cancelTopupPayment(id); router.refresh(); })}
      className="w-full text-center text-xs text-stone-500 underline hover:text-stone-900"
    >
      Hủy giao dịch và quay lại
    </button>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
