import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, SimulateTransfer } from "@/components/shop/order-live";
import { Card, Money, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOCAL_RECEIVING_ACCOUNTS } from "@/lib/mock/accounts";

const EVENT_ICON: Record<string, string> = {
  "order.created": "🧾",
  "payment.initiated": "➡️",
  "payment.captured": "✅",
  "payment.failed": "❌",
  "payment.error": "⚠️",
  "payment.rerouted": "🔀",
  "transfer.instructions_issued": "🏦",
  "transfer.sent": "📤",
  "transfer.matched": "✅",
  "transfer.underpaid": "⚠️",
  "transfer.mismatch": "⚠️",
  "webhook.received": "📨",
  "ledger.synced": "📒",
  "wallet.debited": "👛",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!order || (order.userId !== user.id && user.role !== "ADMIN")) notFound();

  // Giao dịch trong sổ cái (đã sync từ provider) liên quan tới đơn này
  const txs = await prisma.transaction.findMany({
    where: {
      OR: [
        ...(order.paymentRef ? [{ externalId: order.paymentRef }] : []),
        { reference: order.number },
        ...(order.bankReference ? [{ reference: order.bankReference }] : []),
      ],
    },
    include: { account: { select: { name: true } } },
    orderBy: { occurredAt: "asc" },
  });

  const walletTxs = await prisma.walletTransaction.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  const bank = order.status === "AWAITING_TRANSFER" ? LOCAL_RECEIVING_ACCOUNTS[order.currency] : null;
  const settled = order.status === "PAID" && (txs.some((t) => t.status === "COMPLETED") || order.paymentMethod === "STORE_WALLET");
  const live = order.status === "AWAITING_TRANSFER" || (order.status === "PAID" && !settled);

  return (
    <div className="space-y-6">
      <AutoRefresh enabled={live} ms={2500} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">Đơn hàng</p>
          <h1 className="text-2xl font-semibold tracking-tight">{order.number}</h1>
        </div>
        <div className="flex items-center gap-3">
          {live && <span className="flex items-center gap-1.5 text-xs text-stone-500"><span className="size-2 animate-pulse rounded-full bg-emerald-500" />Cập nhật trực tiếp</span>}
          <StatusBadge status={order.status} />
        </div>
      </div>

      {order.status === "PAID" && (
        <div className="rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
          Cảm ơn {order.customerName}! Đã nhận <b><Money amount={Number(order.total)} currency={order.currency} /></b> lúc {order.paidAt && fmtDate(order.paidAt, true)}.
        </div>
      )}

      {bank && order.bankReference && (
        <Card title={`Chuyển khoản ${order.currency} nội địa`}>
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <dl className="space-y-2 text-sm">
              <Row k="Ngân hàng" v={bank.bank} />
              <Row k="Chủ tài khoản" v={bank.holder} />
              {bank.fields.map((f) => <Row key={f.label} k={f.label} v={<span className="font-mono">{f.value}</span>} />)}
              <Row k="Số tiền" v={<b><Money amount={Number(order.total)} currency={order.currency} /></b>} />
              <Row k="Nội dung CK (bắt buộc)" v={<span className="rounded bg-amber-100 px-2 py-0.5 font-mono font-semibold">{order.bankReference}</span>} />
            </dl>
            <div className="space-y-3 text-sm text-stone-600">
              <p>Kênh: <b>{bank.rail}</b> — {bank.eta}. Hệ thống tự đối soát theo nội dung chuyển khoản & số tiền, đơn sẽ chuyển sang “Đã thanh toán” ngay khi tiền về.</p>
              <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-800 uppercase">Sandbox</p>
                <SimulateTransfer orderId={order.id} />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Lịch sử giao dịch của đơn">
            <ol className="relative space-y-4 p-5">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-0.5 text-base">{EVENT_ICON[e.type] ?? "•"}</span>
                  <div className="flex-1">
                    <p className="text-sm">{e.message}</p>
                    <p className="text-xs text-stone-500">
                      <span className="font-mono">{e.type}</span> • {fmtDate(e.createdAt, true)}
                    </p>
                    {e.data && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-900">Chi tiết</summary>
                        <pre className="mt-1 max-h-60 overflow-auto rounded bg-stone-900 p-3 text-xs text-stone-100">{JSON.stringify(e.data, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {walletTxs.length > 0 && (
            <Card title="Trừ tiền từ ví của bạn">
              <div className="divide-y">
                {walletTxs.map((w) => (
                  <div key={w.id} className="grid gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-2">
                    <Row k="Ví" v={w.currency} />
                    <Row k="Trạng thái" v={<StatusBadge status={w.status} />} />
                    <Row k="Số tiền" v={<Money amount={Number(w.amount)} currency={w.currency} signed direction={w.direction} />} />
                    <Row k="Số dư sau GD" v={w.balanceAfter !== null ? <Money amount={Number(w.balanceAfter)} currency={w.currency} /> : "—"} />
                    <Row k="Mã tham chiếu" v={<span className="font-mono text-xs">{w.reference}</span>} />
                    <Row k="Thời điểm" v={fmtDate(w.createdAt, true)} />
                    <div className="sm:col-span-2"><Link href={`/account/wallet/${w.id}`} className="text-xs font-medium underline">Xem trong sổ ví →</Link></div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {order.paymentMethod !== "STORE_WALLET" && <Card title="Ghi nhận trong ví nhận tiền (đã sync từ provider)">
            {txs.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">{order.status === "PAID" ? "Đang đồng bộ từ provider…" : "Chưa có giao dịch tiền vào."}</p>
            ) : (
              <div className="divide-y">
                {txs.map((t) => (
                  <div key={t.id} className="grid gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-2">
                    <Row k="Provider" v={<ProviderTag provider={t.provider} />} />
                    <Row k="Ví" v={t.account.name} />
                    <Row k="Mã giao dịch" v={<span className="font-mono text-xs">{t.externalId}</span>} />
                    <Row k="Trạng thái" v={<StatusBadge status={t.status} />} />
                    <Row k="Số tiền gộp" v={<Money amount={Number(t.amount)} currency={t.currency} />} />
                    <Row k="Phí" v={<Money amount={Number(t.fee)} currency={t.feeCurrency ?? t.currency} />} />
                    <Row k="Thực nhận" v={<b><Money amount={Number(t.amount) - Number(t.fee)} currency={t.currency} /></b>} />
                    <Row k="Quy đổi tham chiếu" v={<Money amount={Number(t.amountUsd)} currency="USD" />} />
                    <Row k="Người trả" v={t.counterparty ?? "—"} />
                    <Row k="Thời điểm" v={fmtDate(t.occurredAt, true)} />
                    <div className="sm:col-span-2">
                      <Link href={`/admin/transactions/${t.id}`} className="text-xs font-medium underline">Xem trong sổ giao dịch →</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>}
        </div>

        <Card title="Tóm tắt">
          <ul className="space-y-2 p-5 text-sm">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>{i.name} × {i.quantity}</span>
                <Money amount={Number(i.lineTotal)} currency={order.currency} />
              </li>
            ))}
            <li className="flex justify-between border-t pt-2 text-stone-600"><span>Vận chuyển</span><Money amount={Number(order.shipping)} currency={order.currency} /></li>
            <li className="flex justify-between font-semibold"><span>Tổng</span><Money amount={Number(order.total)} currency={order.currency} /></li>
          </ul>
          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            <Row k="Thanh toán" v={order.paymentMethod ?? "—"} />
            <Row k="Provider" v={order.provider ? <ProviderTag provider={order.provider} /> : "—"} />
            <Row k="Email" v={order.email} />
            <Row k="Giao tới" v={`${order.address}, ${order.country}`} />
          </dl>
          <div className="px-5 pb-5">
            <Link href="/account/orders" className="text-sm underline">Đơn hàng của tôi</Link>
          </div>
        </Card>
      </div>
    </div>
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
