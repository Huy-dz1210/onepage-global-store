import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { DEFAULT_CURRENCY, isShopCurrency, type ShopCurrency } from "@/lib/currency";

export async function getCurrency(): Promise<ShopCurrency> {
  const c = (await cookies()).get("currency")?.value;
  return isShopCurrency(c) ? c : DEFAULT_CURRENCY;
}

export type CatalogItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  image: string;
  color: string;
  price: number;
};

export async function getCatalog(currency: ShopCurrency): Promise<CatalogItem[]> {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { prices: { where: { currency } } },
    orderBy: { createdAt: "asc" },
  });
  return products
    .filter((p) => p.prices.length)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      description: p.description,
      image: p.image,
      color: p.color,
      price: Number(p.prices[0].amount),
    }));
}
