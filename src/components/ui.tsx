import { formatMoney } from "@/lib/fx";

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-stone-100 text-stone-600 ring-stone-500/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  COMPLETED: "green",
  PAID: "green",
  SUCCESS: "green",
  PENDING: "amber",
  PENDING_PAYMENT: "amber",
  AWAITING_TRANSFER: "blue",
  RUNNING: "blue",
  FAILED: "red",
  CANCELLED: "gray",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Hoàn tất",
  PAID: "Đã thanh toán",
  PENDING: "Đang xử lý",
  PENDING_PAYMENT: "Chờ thanh toán",
  AWAITING_TRANSFER: "Chờ chuyển khoản",
  FAILED: "Thất bại",
  CANCELLED: "Đã hủy",
  SUCCESS: "Thành công",
  RUNNING: "Đang chạy",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

const PROVIDER_STYLE: Record<string, string> = {
  PINGPONG: "bg-red-500",
  PAYONEER: "bg-orange-500",
  WORLDFIRST: "bg-blue-600",
};
const PROVIDER_LABEL: Record<string, string> = { PINGPONG: "PingPong", PAYONEER: "Payoneer", WORLDFIRST: "WorldFirst" };

export function ProviderTag({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`size-2 rounded-full ${PROVIDER_STYLE[provider] ?? "bg-stone-400"}`} />
      {PROVIDER_LABEL[provider] ?? provider}
    </span>
  );
}

export function Money({ amount, currency, signed, direction }: { amount: number | string; currency: string; signed?: boolean; direction?: "IN" | "OUT" }) {
  const n = Number(amount);
  const sign = signed && direction ? (direction === "IN" ? "+" : "−") : "";
  const tone = signed && direction ? (direction === "IN" ? "text-emerald-700" : "text-stone-900") : "";
  return <span className={`tabular whitespace-nowrap ${tone}`}>{sign}{formatMoney(Math.abs(n), currency)}</span>;
}

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function fmtDate(d: Date | string, withSeconds = false) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: withSeconds ? "medium" : "short",
    timeZone: process.env.NEXT_PUBLIC_TZ ?? "Asia/Bangkok",
  }).format(new Date(d));
}
