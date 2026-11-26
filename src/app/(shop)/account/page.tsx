import Link from "next/link";
import { Card, Money, StatusBadge, fmtDate } from "@/components/ui";
import { WalletTxRow } from "@/components/shop/wallet-tx-row";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SHOP_CURRENCIES } from "@/lib/currency";

export default async function AccountHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser("/account");
  const { denied } = await searchParams;
  const [wallets, txs, orders, flows] = await Promise.all([
    prisma.wallet.findMany({ where: { userId: user.id } }),
    prisma.walletTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.walletTransaction.groupBy({ by: ["currency", "direction"], where: { userId: user.id, status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  const sum = (c: string, d: "IN" | "OUT") => Number(flows.find((f) => f.currency === c && f.direction === d)?._sum.amount ?? 0);

  return (
    <div className="space-y-6">
      {denied && <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Tài khoản này không có quyền quản trị.</p>}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ví đa tiền tệ</h2>
          <Link href="/account/wallet/topup" className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">+ Nạp tiền</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SHOP_CURRENCIES.map((c) => {
            const w = wallets.find((x) => x.currency === c.code);
            return (
              <Link key={c.code} href={`/account/wallet?currency=${c.code}`} className={`rounded-xl border bg-white p-4 hover:border-stone-400 ${w && Number(w.balance) > 0 ? "border-stone-200" : "border-dashed border-stone-200 opacity-70"}`}>
                <p className="text-xs text-stone-500">{c.flag} Ví {c.code}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight"><Money amount={Number(w?.balance ?? 0)} currency={c.code} /></p>
                <p className="mt-1 text-xs text-stone-500">
                  vào <Money amount={sum(c.code, "IN")} currency={c.code} /> • ra <Money amount={sum(c.code, "OUT")} currency={c.code} />
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Giao dịch ví gần đây" action={<Link href="/account/wallet" className="text-xs underline">Xem tất cả</Link>}>
          <ul className="divide-y divide-stone-100">
            {txs.map((t) => <WalletTxRow key={t.id} t={t} />)}
            {txs.length === 0 && <li className="p-4 text-sm text-stone-500">Chưa có giao dịch. <Link href="/account/wallet/topup" className="underline">Nạp tiền</Link> để bắt đầu.</li>}
          </ul>
        </Card>
        <Card title="Đơn hàng gần đây" action={<Link href="/account/orders" className="text-xs underline">Xem tất cả</Link>}>
          <ul className="divide-y divide-stone-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50">
                  <span className="flex-1 font-mono text-xs">{o.number}<span className="block font-sans text-stone-500">{fmtDate(o.createdAt)}</span></span>
                  <StatusBadge status={o.status} />
                  <Money amount={Number(o.total)} currency={o.currency} />
                </Link>
              </li>
            ))}
            {orders.length === 0 && <li className="p-4 text-sm text-stone-500">Chưa có đơn hàng.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
