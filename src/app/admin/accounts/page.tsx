import { addAccount } from "@/app/actions";
import { SyncButton, ToggleAccount } from "@/components/admin/sync-button";
import { Card, ProviderTag, StatusBadge, fmtDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MOCK_MERCHANTS } from "@/lib/mock/accounts";
import { PROVIDER_META } from "@/lib/providers/meta";
import { nextSyncAt } from "@/lib/scheduler";

const inp = "w-full rounded-lg border border-stone-300 px-3 py-1.5 text-sm";

export default async function AccountsPage() {
  await requireAdmin();
  const [accounts, runs] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { transactions: true } } } }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 25, include: { account: { select: { name: true } } } }),
  ]);
  const next = nextSyncAt();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tài khoản & đồng bộ</h1>
          <p className="text-sm text-stone-500">Lần sync tự động tiếp theo: {next ? fmtDate(new Date(next), true) : "scheduler chưa chạy"}</p>
        </div>
        <SyncButton label="Sync tất cả" />
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-stone-500">
            <tr>{["Tài khoản", "Provider", "API base URL", "Giao dịch", "Sync gần nhất", "Trạng thái", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">{a.name}<span className="block font-mono text-xs font-normal text-stone-500">{a.externalAccountId}</span></td>
                <td className="px-4 py-3"><ProviderTag provider={a.provider} /></td>
                <td className="max-w-56 truncate px-4 py-3 font-mono text-xs text-stone-500">{a.baseUrl.startsWith("import://") ? "Import sao kê" : a.baseUrl}</td>
                <td className="tabular px-4 py-3">{a._count.transactions.toLocaleString()}</td>
                <td className="px-4 py-3 text-stone-600">
                  {a.lastSyncedAt ? fmtDate(a.lastSyncedAt, true) : "Chưa"}
                  {a.lastError && <span className="block max-w-56 truncate text-xs text-red-600" title={a.lastError}>{a.lastError}</span>}
                </td>
                <td className="px-4 py-3"><ToggleAccount accountId={a.id} enabled={a.enabled} /></td>
                <td className="px-4 py-3 text-right"><SyncButton accountId={a.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Kết nối tài khoản mới">
          <form action={addAccount} className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <select name="provider" className={inp} defaultValue="PINGPONG">
                {Object.entries(PROVIDER_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <input name="name" placeholder="Tên hiển thị" className={inp} />
            </div>
            <label className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <input type="checkbox" name="importOnly" className="accent-stone-900" />
              Tài khoản thật chưa có API – chỉ dùng <b>Import sao kê</b> (không cần credentials)
            </label>
            <input name="baseUrl" placeholder="API base URL (bỏ trống = mock)" className={inp} />
            <div className="grid grid-cols-2 gap-3">
              {["appId", "appSecret", "clientId", "clientSecret", "programId", "payeeId"].map((k) => (
                <input key={k} name={k} placeholder={k} className={inp} type={k.toLowerCase().includes("secret") ? "password" : "text"} />
              ))}
            </div>
            <p className="text-xs text-stone-500">PingPong dùng appId/appSecret • Payoneer dùng clientId/clientSecret/programId/payeeId • WorldFirst dùng clientId/clientSecret. Credentials được mã hóa AES-256-GCM.</p>
            <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">Kết nối & sync</button>
          </form>
          <details className="border-t px-4 py-3 text-xs text-stone-600">
            <summary className="cursor-pointer font-medium">Tài khoản clone (mock) có sẵn</summary>
            <pre className="mt-2 overflow-auto rounded bg-stone-100 p-3">{JSON.stringify(MOCK_MERCHANTS.map((m) => ({ provider: m.provider, ...m.credentials })), null, 2)}</pre>
          </details>
        </Card>

        <Card title="Nhật ký đồng bộ">
          <ul className="max-h-[480px] divide-y divide-stone-100 overflow-y-auto text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <StatusBadge status={r.status} />
                <span className="flex-1">
                  {r.account.name} <span className="text-xs text-stone-500">({r.trigger})</span>
                  {r.error && <span className="block truncate text-xs text-red-600">{r.error}</span>}
                </span>
                <span className="text-right text-xs text-stone-500">
                  {r.fetched} lấy • +{r.inserted} mới • {r.updated} cập nhật
                  <span className="block">{fmtDate(r.startedAt, true)}{r.finishedAt ? ` • ${((+r.finishedAt - +r.startedAt) / 1000).toFixed(1)}s` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
