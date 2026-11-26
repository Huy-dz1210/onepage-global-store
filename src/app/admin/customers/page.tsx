import Link from "next/link";
import { Card, Money, StatusBadge, fmtDate } from "@/components/ui";
import { METHOD_LABEL, WALLET_TYPE_LABEL } from "@/components/shop/wallet-tx-row";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function CustomersPage() {
  await requireAdmin();
  const [users, liabilities, recent] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { wallets: { where: { balance: { gt: 0 } }, orderBy: { currency: "asc" } }, _count: { select: { orders: true, walletTxs: true } } },
    }),
    prisma.wallet.groupBy({ by: ["currency"], _sum: { balance: true } }),
    prisma.walletTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { email: true } } } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Khách hàng & ví</h1>
        <p className="text-sm text-stone-500">Tổng số dư khách đang giữ trong ví (công nợ của cửa hàng):</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {liabilities.filter((l) => Number(l._sum.balance) > 0).map((l) => (
            <span key={l.currency} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"><Money amount={Number(l._sum.balance)} currency={l.currency} /></span>
          ))}
        </div>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-stone-500">
            <tr>{["Khách hàng", "Vai trò", "Số dư ví", "Đơn", "GD ví", "Ngày tạo"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2.5">{u.name}<span className="block text-xs text-stone-500">{u.email}</span></td>
                <td className="px-4 py-2.5 text-xs">{u.role}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.wallets.map((w) => <span key={w.id} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs"><Money amount={Number(w.balance)} currency={w.currency} /></span>)}
                    {u.wallets.length === 0 && <span className="text-xs text-stone-400">—</span>}
                  </div>
                </td>
                <td className="tabular px-4 py-2.5">{u._count.orders}</td>
                <td className="tabular px-4 py-2.5">{u._count.walletTxs}</td>
                <td className="px-4 py-2.5 text-stone-600">{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Giao dịch ví mới nhất (mọi khách)">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            {recent.map((t) => (
              <tr key={t.id} className="hover:bg-stone-50">
                <td className="px-4 py-2 text-stone-600">{fmtDate(t.createdAt)}</td>
                <td className="px-4 py-2 text-xs">{t.user.email}</td>
                <td className="px-4 py-2">{WALLET_TYPE_LABEL[t.type]} <span className="text-xs text-stone-500">• {METHOD_LABEL[t.method] ?? t.method}</span></td>
                <td className="px-4 py-2"><Link href={`/account/wallet/${t.id}`} className="font-mono text-xs hover:underline">{t.reference}</Link></td>
                <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-2 text-right"><Money amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
