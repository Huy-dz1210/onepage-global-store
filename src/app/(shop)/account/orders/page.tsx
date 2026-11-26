import Link from "next/link";
import { Card, Money, StatusBadge, fmtDate } from "@/components/ui";
import { METHOD_LABEL } from "@/components/shop/wallet-tx-row";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function MyOrders() {
  const user = await requireUser("/account/orders");
  const orders = await prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { items: true } });
  return (
    <Card>
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs text-stone-500">
          <tr>{["Ngày", "Mã đơn", "Sản phẩm", "Thanh toán", "Trạng thái", "Tổng"].map((h, i) => <th key={h} className={`px-4 py-2.5 font-medium ${i === 5 ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 text-stone-600">{fmtDate(o.createdAt)}</td>
              <td className="px-4 py-2.5 font-mono text-xs"><Link href={`/orders/${o.id}`} className="hover:underline">{o.number}</Link></td>
              <td className="max-w-xs truncate px-4 py-2.5">{o.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</td>
              <td className="px-4 py-2.5 text-xs">{o.paymentMethod ? METHOD_LABEL[o.paymentMethod] : "—"}</td>
              <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
              <td className="px-4 py-2.5 text-right font-medium"><Money amount={Number(o.total)} currency={o.currency} /></td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-stone-500">Chưa có đơn. <Link href="/" className="underline">Mua sắm ngay</Link></td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
