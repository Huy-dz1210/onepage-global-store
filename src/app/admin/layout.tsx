import Link from "next/link";
import { AutoRefresh } from "@/components/shop/order-live";
import { logout } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { intervalMinutes } from "@/lib/scheduler";

const NAV = [
  ["/admin", "Tổng quan"],
  ["/admin/transactions", "Giao dịch"],
  ["/admin/orders", "Đơn hàng"],
  ["/admin/customers", "Khách hàng & ví"],
  ["/admin/import", "Import sao kê"],
  ["/admin/accounts", "Tài khoản & Sync"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <AutoRefresh ms={30000} />
      <aside className="hidden w-56 shrink-0 border-r border-stone-200 bg-white p-4 md:block">
        <Link href="/admin" className="block px-2 text-lg font-semibold tracking-tight">
          onepage<span className="text-emerald-600">.</span>finance
        </Link>
        <nav className="mt-6 space-y-1 text-sm">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-lg px-2 py-1.5 text-stone-700 hover:bg-stone-100">
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 space-y-1 px-2 text-xs text-stone-500">
          <p>Auto-sync: mỗi {intervalMinutes()} phút</p>
          <p>Webhook: realtime</p>
          <p>UI tự refresh: 30s</p>
        </div>
        <Link href="/" className="mt-8 block px-2 text-sm text-stone-500 hover:text-stone-900">← Về cửa hàng</Link>
        <form action={logout} className="mt-2 px-2">
          <button className="text-sm text-stone-500 hover:text-stone-900" title={admin.email}>Đăng xuất</button>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="flex gap-3 overflow-x-auto border-b bg-white px-4 py-2 text-sm md:hidden">
          {NAV.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap">{label}</Link>)}
        </nav>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
