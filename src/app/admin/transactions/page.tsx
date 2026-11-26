import Link from "next/link";
import { Card, Money, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type TxSearch, txWhere } from "@/lib/tx-filters";

const PAGE_SIZE = 50;
const sel = "rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<TxSearch> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where = txWhere(sp);

  const [rows, total, sums, accounts, currencies] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { account: { select: { name: true } } },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["direction"], where: { ...where, status: "COMPLETED" }, _sum: { amountUsd: true } }),
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.transaction.findMany({ distinct: ["currency"], select: { currency: true }, orderBy: { currency: "asc" } }),
  ]);

  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("page", String(p));
    return `?${u}`;
  };
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  const inUsd = Number(sums.find((s) => s.direction === "IN")?._sum.amountUsd ?? 0);
  const outUsd = Number(sums.find((s) => s.direction === "OUT")?._sum.amountUsd ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Giao dịch</h1>
          <p className="text-sm text-stone-500">
            {total.toLocaleString()} giao dịch • vào <span className="text-emerald-700"><Money amount={inUsd} currency="USD" /></span> • ra <Money amount={outUsd} currency="USD" /> (USD eq., đã hoàn tất)
          </p>
        </div>
        <a href={`/api/admin/transactions/export?${exportQs}`} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:border-stone-900">
          Xuất CSV
        </a>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Tìm mã GD, đối tác, nội dung…" className={`${sel} w-64`} />
        <select name="provider" defaultValue={sp.provider ?? ""} className={sel}>
          <option value="">Mọi provider</option>
          <option value="PINGPONG">PingPong</option>
          <option value="PAYONEER">Payoneer</option>
          <option value="WORLDFIRST">WorldFirst</option>
        </select>
        <select name="account" defaultValue={sp.account ?? ""} className={sel}>
          <option value="">Mọi tài khoản</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select name="currency" defaultValue={sp.currency ?? ""} className={sel}>
          <option value="">Mọi tiền tệ</option>
          {currencies.map((c) => <option key={c.currency}>{c.currency}</option>)}
        </select>
        <select name="direction" defaultValue={sp.direction ?? ""} className={sel}>
          <option value="">Vào & ra</option>
          <option value="IN">Tiền vào</option>
          <option value="OUT">Tiền ra</option>
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className={sel}>
          <option value="">Mọi loại</option>
          {["COLLECTION", "TRANSFER_IN", "WITHDRAWAL", "PAYMENT", "CARD", "FX", "FEE", "REFUND"].map((t) => <option key={t}>{t}</option>)}
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
        <Link href="/admin/transactions" className="px-2 py-1.5 text-sm text-stone-500 hover:text-stone-900">Xóa lọc</Link>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-stone-500">
              <tr>
                {["Thời gian", "Provider", "Loại", "Đối tác / Nội dung", "Trạng thái", "Số tiền", "Phí", "USD eq."].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 font-medium ${i >= 5 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-stone-600"><Link href={`/admin/transactions/${t.id}`}>{fmtDate(t.occurredAt)}</Link></td>
                  <td className="px-4 py-2.5"><ProviderTag provider={t.provider} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.type}{t.type === "FX" && t.counterCurrency ? ` → ${t.counterCurrency}` : ""}</td>
                  <td className="max-w-xs px-4 py-2.5">
                    <Link href={`/admin/transactions/${t.id}`} className="block truncate hover:underline">{t.counterparty}</Link>
                    <span className="block truncate text-xs text-stone-500">{t.description}</span>
                  </td>
                  <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                  <td className="px-4 py-2.5 text-right font-medium"><Money amount={Number(t.amount)} currency={t.currency} signed direction={t.direction} /></td>
                  <td className="px-4 py-2.5 text-right text-stone-500">{Number(t.fee) ? <Money amount={Number(t.fee)} currency={t.feeCurrency ?? t.currency} /> : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-stone-500"><Money amount={Number(t.amountUsd)} currency="USD" /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-stone-500">Không có giao dịch.</td></tr>}
            </tbody>
          </table>
        </div>
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
