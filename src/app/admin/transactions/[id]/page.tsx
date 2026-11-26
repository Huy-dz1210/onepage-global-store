import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Money, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function TxDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const t = await prisma.transaction.findUnique({ where: { id }, include: { account: true } });
  if (!t) notFound();
  const order = t.reference
    ? await prisma.order.findFirst({ where: { OR: [{ number: t.reference }, { bankReference: t.reference }, { paymentRef: t.externalId }] } })
    : null;

  const rows: [string, React.ReactNode][] = [
    ["Provider", <ProviderTag key="p" provider={t.provider} />],
    ["Tài khoản", t.account.name],
    ["Mã giao dịch (provider)", <span key="e" className="font-mono text-xs">{t.externalId}</span>],
    ["Loại", <span key="t" className="font-mono text-xs">{t.type}</span>],
    ["Chiều tiền", t.direction === "IN" ? "Tiền vào" : "Tiền ra"],
    ["Trạng thái", <StatusBadge key="s" status={t.status} />],
    ["Số tiền", <Money key="a" amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} />],
    ["Phí", <Money key="f" amount={Number(t.fee)} currency={t.feeCurrency ?? t.currency} />],
    ["Thực nhận / thực trừ", <Money key="n" amount={t.direction === "IN" ? Number(t.amount) - Number(t.fee) : Number(t.amount) + Number(t.fee)} currency={t.currency} />],
    ...(t.counterCurrency
      ? ([
          ["Quy đổi sang", <Money key="c" amount={Number(t.counterAmount)} currency={t.counterCurrency} />],
          ["Tỷ giá", <span key="r" className="tabular">1 {t.currency} = {Number(t.fxRate)} {t.counterCurrency}</span>],
        ] as [string, React.ReactNode][])
      : []),
    ["USD tham chiếu", <Money key="u" amount={Number(t.amountUsd)} currency="USD" />],
    ["Đối tác", t.counterparty ?? "—"],
    ["Nội dung", t.description ?? "—"],
    ["Tham chiếu", <span key="ref" className="font-mono text-xs">{t.reference ?? "—"}</span>],
    ["Thời điểm phát sinh", fmtDate(t.occurredAt, true)],
    ["Đồng bộ lần đầu", fmtDate(t.createdAt, true)],
    ["Cập nhật gần nhất", fmtDate(t.updatedAt, true)],
  ];

  return (
    <div className="space-y-5">
      <Link href="/admin/transactions" className="text-sm text-stone-500 hover:text-stone-900">← Giao dịch</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight"><Money amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} /></h1>
        <StatusBadge status={t.status} />
      </div>
      {order && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Gắn với đơn hàng web <Link href={`/orders/${order.id}`} className="font-semibold underline">{order.number}</Link>
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Thông tin chuẩn hóa">
          <dl className="divide-y divide-stone-100 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-stone-500">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Payload gốc từ provider">
          <pre className="max-h-[640px] overflow-auto p-4 text-xs">{JSON.stringify(t.raw, null, 2)}</pre>
        </Card>
      </div>
    </div>
  );
}
