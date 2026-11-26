import Link from "next/link";
import { Card, Money, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function OrdersPage() {
  await requireAdmin();
  const [orders, byCurrency] = await Promise.all([
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { items: true } } } }),
    prisma.order.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { total: true }, _count: true }),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Đơn hàng web</h1>
      <div className="flex flex-wrap gap-2">
        {byCurrency.map((c) => (
          <span key={c.currency} className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
            <Money amount={Number(c._sum.total)} currency={c.currency} /> <span className="text-stone-500">• {c._count} đơn</span>
          </span>
        ))}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-stone-500">
            <tr>
              {["Thời gian", "Mã đơn", "Khách", "Phương thức", "Provider", "Trạng thái", "Tổng"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 font-medium ${i === 6 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-stone-50">
                <td className="px-4 py-2.5 text-stone-600">{fmtDate(o.createdAt)}</td>
                <td className="px-4 py-2.5 font-mono text-xs"><Link href={`/orders/${o.id}`} className="hover:underline">{o.number}</Link></td>
                <td className="px-4 py-2.5">{o.customerName}<span className="block text-xs text-stone-500">{o.country}</span></td>
                <td className="px-4 py-2.5 text-xs">{o.paymentMethod ?? "—"}</td>
                <td className="px-4 py-2.5">{o.provider ? <ProviderTag provider={o.provider} /> : "—"}</td>
                <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-2.5 text-right font-medium"><Money amount={Number(o.total)} currency={o.currency} /></td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-stone-500">Chưa có đơn – thử mua hàng ở <Link href="/" className="underline">cửa hàng</Link>.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
