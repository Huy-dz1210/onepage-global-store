import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/shop/order-live";
import { SimulateTopup } from "@/components/shop/topup-form";
import { METHOD_LABEL, WALLET_TYPE_LABEL } from "@/components/shop/wallet-tx-row";
import { Card, Money, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOCAL_RECEIVING_ACCOUNTS } from "@/lib/mock/accounts";

export default async function WalletTxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/account/wallet/${id}`);
  const t = await prisma.walletTransaction.findUnique({ where: { id }, include: { order: true } });
  if (!t || (t.userId !== user.id && user.role !== "ADMIN")) notFound();
  const bank = t.status === "PENDING" && t.method === "BANK_TRANSFER" ? LOCAL_RECEIVING_ACCOUNTS[t.currency] : null;

  const rows: [string, React.ReactNode][] = [
    ["Loại", WALLET_TYPE_LABEL[t.type]],
    ["Trạng thái", <StatusBadge key="s" status={t.status} />],
    ["Số tiền", <b key="a"><Money amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} /></b>],
    ["Ví", t.currency],
    ["Số dư sau giao dịch", t.balanceAfter !== null ? <Money key="b" amount={Number(t.balanceAfter)} currency={t.currency} /> : "—"],
    ["Phương thức", METHOD_LABEL[t.method] ?? t.method],
    ["Cổng thanh toán", t.provider ? <ProviderTag key="p" provider={t.provider} /> : "Nội bộ"],
    ["Mã tham chiếu", <span key="r" className="font-mono text-xs">{t.reference}</span>],
    ["Mã GD phía cổng", <span key="e" className="font-mono text-xs">{t.externalRef ?? "—"}</span>],
    ["Nội dung", t.description],
    ["Tạo lúc", fmtDate(t.createdAt, true)],
    ["Hoàn tất lúc", t.completedAt ? fmtDate(t.completedAt, true) : "—"],
  ];
  if (t.failReason) rows.push(["Lý do lỗi", <span key="f" className="text-red-700">{t.failReason}</span>]);
  if (t.order) rows.push(["Đơn hàng", <Link key="o" href={`/orders/${t.order.id}`} className="underline">{t.order.number}</Link>]);

  return (
    <div className="space-y-5">
      <AutoRefresh enabled={t.status === "PENDING"} ms={2500} />
      <Link href="/account/wallet" className="text-sm text-stone-500 hover:text-stone-900">← Sổ giao dịch ví</Link>
      {t.type === "TOPUP" && (
        <Link href={`/pay/${t.id}`} className="block rounded-lg bg-stone-900 px-4 py-2.5 text-center text-sm font-medium text-white">
          {t.status === "PENDING" ? "Tiếp tục thanh toán →" : "Xem biên lai"}
        </Link>
      )}

      {bank && (
        <Card title={`Chuyển khoản ${t.currency} để nạp ví`}>
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <dl className="space-y-2 text-sm">
              <Row k="Ngân hàng" v={bank.bank} />
              <Row k="Chủ tài khoản" v={bank.holder} />
              {bank.fields.map((f) => <Row key={f.label} k={f.label} v={<span className="font-mono">{f.value}</span>} />)}
              <Row k="Số tiền" v={<b><Money amount={Number(t.amount)} currency={t.currency} /></b>} />
              <Row k="Nội dung CK (bắt buộc)" v={<span className="rounded bg-amber-100 px-2 py-0.5 font-mono font-semibold">{t.reference}</span>} />
            </dl>
            <div className="space-y-3 text-sm text-stone-600">
              <p>Kênh {bank.rail} ({bank.eta}). Ví được cộng đúng số tiền thực nhận ngay khi tiền về.</p>
              <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-800 uppercase">Sandbox</p>
                <SimulateTopup id={t.id} />
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="Chi tiết giao dịch ví">
        <dl className="divide-y divide-stone-100 text-sm">
          {rows.map(([k, v]) => <Row key={k} k={k} v={v} pad />)}
        </dl>
      </Card>
    </div>
  );
}

function Row({ k, v, pad }: { k: string; v: React.ReactNode; pad?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${pad ? "px-4 py-2.5" : ""}`}>
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
