import Link from "next/link";
import { requireUser } from "@/lib/auth";

const TABS = [
  ["/account", "Tổng quan"],
  ["/account/wallet", "Ví & lịch sử giao dịch"],
  ["/account/wallet/topup", "Nạp tiền"],
  ["/account/orders", "Đơn hàng"],
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-stone-500">Xin chào</p>
        <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
        <p className="text-sm text-stone-500">{user.email}</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 text-sm">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className="-mb-px border-b-2 border-transparent px-3 py-2 whitespace-nowrap text-stone-600 hover:border-stone-400 hover:text-stone-900">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
