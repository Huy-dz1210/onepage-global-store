import Image from "next/image";
import Link from "next/link";
import { AddToCart } from "@/components/shop/add-to-cart";
import { formatMoney } from "@/lib/fx";
import { getCatalog, getCurrency } from "@/lib/shop-server";

export default async function ShopHome() {
  const currency = await getCurrency();
  const products = await getCatalog(currency);

  return (
    <div className="space-y-10">
      <section className="grid items-center gap-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-stone-100 px-6 py-10 sm:grid-cols-[1.3fr_1fr] sm:px-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mua từ Việt Nam, trả bằng tiền của bạn.</h1>
          <p className="mt-3 max-w-lg text-stone-600">
            Giá niêm yết sẵn theo từng thị trường. Bạn trả {currency}, chúng tôi nhận {currency} vào ví đa tiền tệ – không bước đổi tiền, không phí FX ẩn.
          </p>
        </div>
        <ul className="grid gap-2 text-sm">
          {[
            ["⚡", "Ví PingPong / Payoneer / WorldFirst – 1 chạm"],
            ["💳", "Thẻ Visa / Mastercard / Amex"],
            ["🏦", "Chuyển khoản nội địa: ACH, SEPA Instant, Faster Payments, NPP…"],
          ].map(([i, t]) => (
            <li key={t} className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2">
              <span>{i}</span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Sản phẩm</h2>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <article key={p.id} className="group">
              <Link href={`/products/${p.slug}`} className="block overflow-hidden rounded-xl">
                <Image src={p.image} alt={p.name} width={400} height={400} className="aspect-square w-full transition group-hover:scale-105" />
              </Link>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-stone-500">{p.category}</p>
                  <Link href={`/products/${p.slug}`} className="text-sm font-medium hover:underline">{p.name}</Link>
                </div>
                <p className="tabular text-sm font-semibold">{formatMoney(p.price, currency)}</p>
              </div>
              <div className="mt-2">
                <AddToCart productId={p.id} />
              </div>
            </article>
          ))}
        </div>
        {products.length === 0 && <p className="text-stone-500">Chưa có sản phẩm. Chạy <code>npm run db:seed</code>.</p>}
      </section>
    </div>
  );
}
