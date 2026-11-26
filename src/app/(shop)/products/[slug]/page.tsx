import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/shop/add-to-cart";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/fx";
import { SHOP_CURRENCIES } from "@/lib/currency";
import { getCurrency } from "@/lib/shop-server";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const currency = await getCurrency();
  const product = await prisma.product.findUnique({ where: { slug }, include: { prices: true } });
  if (!product) notFound();
  const price = product.prices.find((p) => p.currency === currency);

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <Image src={product.image} alt={product.name} width={600} height={600} className="w-full rounded-2xl" />
      <div className="space-y-5">
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-900">← Cửa hàng</Link>
        <div>
          <p className="text-sm text-stone-500">{product.category} • {product.color}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
        </div>
        <p className="tabular text-2xl font-semibold">{price ? formatMoney(Number(price.amount), currency) : "—"}</p>
        <p className="text-stone-600">{product.description}</p>
        <AddToCart productId={product.id} size="lg" />
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-stone-500 uppercase">Giá theo thị trường</p>
          <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
            {SHOP_CURRENCIES.map((c) => {
              const p = product.prices.find((x) => x.currency === c.code);
              return (
                <li key={c.code} className={c.code === currency ? "font-semibold" : "text-stone-600"}>
                  {c.flag} <span className="tabular">{p ? formatMoney(Number(p.amount), c.code) : "—"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
