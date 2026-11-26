import Link from "next/link";
import type { WalletTransaction } from "@/generated/prisma/client";
import { Money, StatusBadge, fmtDate } from "@/components/ui";

export const WALLET_TYPE_LABEL: Record<string, string> = {
  TOPUP: "Nạp tiền",
  PAYMENT: "Thanh toán",
  REFUND: "Hoàn tiền",
  ADJUSTMENT: "Điều chỉnh",
};

export const METHOD_LABEL: Record<string, string> = {
  CARD: "Thẻ quốc tế",
  WALLET: "Ví điện tử",
  BANK_TRANSFER: "Chuyển khoản",
  STORE_WALLET: "Số dư ví",
};

const ICON: Record<string, string> = { TOPUP: "↓", PAYMENT: "↑", REFUND: "↩", ADJUSTMENT: "±" };

export function WalletTxRow({ t }: { t: WalletTransaction }) {
  return (
    <li>
      <Link href={t.type === "TOPUP" && (t.status === "PENDING" || t.status === "COMPLETED") ? `/pay/${t.id}` : `/account/wallet/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50">
        <span className={`grid size-8 place-items-center rounded-full text-sm ${t.direction === "IN" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-700"}`}>{ICON[t.type]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{t.description}</span>
          <span className="block text-xs text-stone-500">{fmtDate(t.createdAt)} • {METHOD_LABEL[t.method] ?? t.method}</span>
        </span>
        <StatusBadge status={t.status} />
        <span className="w-28 text-right font-medium">
          <Money amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} />
          {t.balanceAfter !== null && <span className="block text-xs font-normal text-stone-500">dư <Money amount={Number(t.balanceAfter)} currency={t.currency} /></span>}
        </span>
      </Link>
    </li>
  );
}
