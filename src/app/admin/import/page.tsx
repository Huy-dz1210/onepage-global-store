import { ImportWizard } from "@/components/admin/import-wizard";
import { Card, ProviderTag, fmtDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ImportPage() {
  await requireAdmin();
  const [accounts, batches] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, provider: true } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { account: { select: { name: true, provider: true } } } }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import sao kê</h1>
        <p className="max-w-3xl text-sm text-stone-500">
          Dùng khi chưa có API: tải file lịch sử giao dịch (CSV/Excel) từ web PingPong, Payoneer, WorldFirst rồi thả vào đây. App tự nhận diện cột (tiếng Anh/Trung/Việt),
          chuẩn hóa về cùng định dạng và chống trùng – import lại file chồng lấn thời gian không tạo bản ghi đôi.
        </p>
      </div>
      <ImportWizard accounts={accounts} />
      <details className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
        <summary className="cursor-pointer font-medium text-stone-900">Cách tải file sao kê từ từng provider</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li><b>Payoneer</b>: Activity → Transactions → chọn khoảng thời gian → Download / Export (CSV).</li>
          <li><b>PingPong</b>: Tài khoản / Lịch sử giao dịch (交易记录) → lọc thời gian → Xuất (Export) Excel.</li>
          <li><b>WorldFirst</b>: Transactions / Statements → chọn tài khoản & thời gian → Download CSV/Excel.</li>
        </ul>
        <p className="mt-2 text-xs">Tên menu có thể khác tùy phiên bản giao diện. Mở file .xls cũ bằng Excel và lưu thành .xlsx trước khi import.</p>
      </details>
      <Card title="Lịch sử import">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-stone-500">
            <tr>{["Thời gian", "Tài khoản", "File", "Dòng", "Mới", "Cập nhật", "Bỏ qua", "Người import"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2.5 text-stone-600">{fmtDate(b.createdAt, true)}</td>
                <td className="px-4 py-2.5"><ProviderTag provider={b.account.provider} /> <span className="text-xs text-stone-500">{b.account.name}</span></td>
                <td className="max-w-48 truncate px-4 py-2.5 font-mono text-xs">{b.fileName}</td>
                <td className="tabular px-4 py-2.5">{b.totalRows}</td>
                <td className="tabular px-4 py-2.5 text-emerald-700">+{b.inserted}</td>
                <td className="tabular px-4 py-2.5">{b.updated}</td>
                <td className="tabular px-4 py-2.5 text-stone-500">{b.skipped}</td>
                <td className="px-4 py-2.5 text-xs text-stone-500">{b.createdBy ?? "—"}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-stone-500">Chưa import file nào.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
