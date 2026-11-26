import Link from "next/link";
import { CartProvider } from "@/components/shop/cart";
import { CartButton, CartDrawer } from "@/components/shop/cart-drawer";
import { CurrencySelect } from "@/components/shop/currency-select";
import { logout } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/fx";
import { getCatalog, getCurrency } from "@/lib/shop-server";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const currency = await getCurrency();
  const catalog = await getCatalog(currency);
  const user = await getCurrentUser();
  const wallet = user ? await prisma.wallet.findUnique({ where: { userId_currency: { userId: user.id, currency } } }) : null;
  return (
    <CartProvider catalog={catalog} currency={currency}>
      <div className="bg-stone-900 py-1.5 text-center text-xs text-stone-200">
        Giao hàng toàn cầu • Thanh toán bằng tiền tệ của bạn (USD, EUR, GBP, JPY, AUD, CAD, SGD) • Demo – không có giao dịch thật
      </div>
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            onepage<span className="text-emerald-600">.</span>store
          </Link>
          <nav className="hidden gap-5 text-sm text-stone-600 sm:flex">
            <Link href="/" className="hover:text-stone-900">Cửa hàng</Link>
            {user && <Link href="/account" className="hover:text-stone-900">Tài khoản</Link>}
            {user?.role === "ADMIN" && <Link href="/admin" className="hover:text-stone-900">Quản trị</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <CurrencySelect value={currency} />
            {user ? (
              <>
                <Link href="/account/wallet" className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:border-emerald-400 sm:block" title="Số dư ví">
                  Ví: <span className="tabular font-medium">{formatMoney(Number(wallet?.balance ?? 0), currency)}</span>
                </Link>
                <form action={logout}>
                  <button className="text-sm text-stone-500 hover:text-stone-900" title={user.email}>Đăng xuất</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="text-sm font-medium hover:underline">Đăng nhập</Link>
            )}
            <CartButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <CartDrawer />
    </CartProvider>
  );
}
