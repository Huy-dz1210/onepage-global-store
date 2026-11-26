import Link from "next/link";
import { Card, Money } from "@/components/ui";
import { WalletTxRow } from "@/components/shop/wallet-tx-row";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE = 30;
const sel = "rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm";

type SP = { currency?: string; type?: string; status?: string; from?: string; to?: string; page?: string };

export default async function WalletPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("/account/wallet");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.WalletTransactionWhereInput = {
    userId: user.id,
    ...(sp.currency ? { currency: sp.currency } : {}),
    ...(sp.type ? { type: sp.type as never } : {}),
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.from || sp.to
      ? { createdAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59.999Z`) } : {}) } }
      : {}),
  };
  const [txs, total, sums, wallets] = await Promise.all([
    prisma.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.walletTransaction.count({ where }),
    prisma.walletTransaction.groupBy({ by: ["currency", "direction"], where: { ...where, status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.wallet.findMany({ where: { userId: user.id }, orderBy: { currency: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  const currencies = Array.from(new Set<string>(sums.map((s) => String(s.currency))));

  return (
    <div className="space-y-5">
      <form className="flex flex-wrap gap-2">
        <select name="currency" defaultValue={sp.currency ?? ""} className={sel}>
          <option value="">Mọi ví</option>
          {wallets.map((w) => <option key={String(w.currency)}>{String(w.currency)}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className={sel}>
          <option value="">Mọi loại</option>
          <option value="TOPUP">Nạp tiền</option>
          <option value="PAYMENT">Thanh toán</option>
          <option value="REFUND">Hoàn tiền</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={sel}>
          <option value="">Mọi trạng thái</option>
          <option value="COMPLETED">Hoàn tất</option>
          <option value="PENDING">Đang xử lý</option>
          <option value="FAILED">Thất bại</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from} className={sel} />
        <input type="date" name="to" defaultValue={sp.to} className={sel} />
        <button className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white">Lọc</button>
        <Link href="/account/wallet" className="px-2 py-1.5 text-sm text-stone-500">Xóa lọc</Link>
      </form>

      {currencies.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {currencies.map((c) => {
            const i = Number(sums.find((s) => s.currency === c && s.direction === "IN")?._sum.amount ?? 0);
            const o = Number(sums.find((s) => s.currency === c && s.direction === "OUT")?._sum.amount ?? 0);
            return (
              <span key={c} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
                <b>{c}</b>: vào <span className="text-emerald-700"><Money amount={i} currency={c} /></span> • ra <Money amount={o} currency={c} />
              </span>
            );
          })}
        </div>
      )}

      <Card title={`Sổ giao dịch ví (${total})`}>
        <ul className="divide-y divide-stone-100">
          {txs.map((t) => <WalletTxRow key={t.id} t={t} />)}
          {txs.length === 0 && <li className="p-6 text-center text-sm text-stone-500">Không có giao dịch.</li>}
        </ul>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
          <span className="text-stone-500">Trang {page}/{pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs(page - 1)} className="rounded border px-3 py-1">← Trước</Link>}
            {page < pages && <Link href={qs(page + 1)} className="rounded border px-3 py-1">Sau →</Link>}
          </div>
        </div>
      </Card>
    </div>
  );
}
