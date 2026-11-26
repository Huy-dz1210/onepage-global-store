import Link from "next/link";
import { FlowChart } from "@/components/admin/flow-chart";
import { SyncButton } from "@/components/admin/sync-button";
import { Card, Money, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

export default async function AdminDashboard() {
  await requireAdmin();
  const since = daysAgo(30);
  const [accounts, balances, flows, recent, pendingCount, daily, storefront] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.balance.findMany({ include: { account: true }, orderBy: [{ availableUsd: "desc" }] }),
    prisma.transaction.groupBy({
      by: ["direction"],
      where: { occurredAt: { gte: since }, status: "COMPLETED" },
      _sum: { amountUsd: true },
      _count: true,
    }),
    prisma.transaction.findMany({ orderBy: { occurredAt: "desc" }, take: 12, include: { account: { select: { name: true } } } }),
    prisma.transaction.count({ where: { status: "PENDING" } }),
    prisma.$queryRaw<{ day: Date; inflow: number; outflow: number }[]>`
      SELECT date_trunc('day', "occurredAt") AS day,
             COALESCE(SUM(CASE WHEN direction = 'IN' THEN "amountUsd" END), 0)::float AS inflow,
             COALESCE(SUM(CASE WHEN direction = 'OUT' THEN "amountUsd" END), 0)::float AS outflow
      FROM "Transaction"
      WHERE "occurredAt" >= ${since} AND status = 'COMPLETED'
      GROUP BY 1 ORDER BY 1`,
    prisma.order.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _count: true }),
  ]);

  const totalUsd = balances.reduce((s, b) => s + Number(b.availableUsd), 0);
  const inflow = Number(flows.find((f) => f.direction === "IN")?._sum.amountUsd ?? 0);
  const outflow = Number(flows.find((f) => f.direction === "OUT")?._sum.amountUsd ?? 0);
  const byCurrency = new Map<string, number>();
  for (const b of balances) byCurrency.set(b.currency, (byCurrency.get(b.currency) ?? 0) + Number(b.available));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tổng quan dòng tiền</h1>
          <p className="text-sm text-stone-500">{accounts.length} tài khoản • cập nhật {fmtDate(daysAgo(0), true)}</p>
        </div>
        <SyncButton label="Sync tất cả" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Tổng số dư (USD eq.)" value={<Money amount={totalUsd} currency="USD" />} />
        <Kpi label="Tiền vào 30 ngày" value={<span className="text-emerald-700"><Money amount={inflow} currency="USD" /></span>} />
        <Kpi label="Tiền ra 30 ngày" value={<Money amount={outflow} currency="USD" />} />
        <Kpi label="Đang xử lý / Đơn web 30 ngày" value={<span>{pendingCount} / {storefront._count}</span>} />
      </div>

      <Card title="Dòng tiền theo ngày (30 ngày, đã hoàn tất)">
        <div className="p-4">
          <FlowChart data={daily.map((d) => ({ day: new Date(d.day).toISOString().slice(5, 10), inflow: Math.round(d.inflow), outflow: Math.round(d.outflow) }))} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Số dư theo ví">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr><th className="px-4 py-2 font-medium">Tài khoản</th><th className="px-4 py-2 font-medium">Tiền tệ</th><th className="px-4 py-2 text-right font-medium">Khả dụng</th><th className="px-4 py-2 text-right font-medium">Chờ về</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {balances.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2"><ProviderTag provider={b.account.provider} /></td>
                  <td className="px-4 py-2 font-mono text-xs">{b.currency}</td>
                  <td className="px-4 py-2 text-right"><Money amount={Number(b.available)} currency={b.currency} /></td>
                  <td className="px-4 py-2 text-right text-stone-500"><Money amount={Number(b.pending)} currency={b.currency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 border-t px-4 py-3">
            {[...byCurrency.entries()].map(([c, v]) => (
              <span key={c} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs"><Money amount={v} currency={c} /></span>
            ))}
          </div>
        </Card>

        <Card title="Giao dịch mới nhất" action={<Link href="/admin/transactions" className="text-xs underline">Xem tất cả</Link>}>
          <ul className="divide-y divide-stone-100">
            {recent.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/transactions/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50">
                  <ProviderTag provider={t.provider} />
                  <span className="min-w-0 flex-1 truncate text-stone-600">{t.description ?? t.type}</span>
                  <StatusBadge status={t.status} />
                  <span className="w-28 text-right"><Money amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} /></span>
                </Link>
              </li>
            ))}
            {recent.length === 0 && <li className="p-4 text-sm text-stone-500">Chưa có dữ liệu – bấm “Sync tất cả”.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
