export const SHOP_CURRENCIES = [
  { code: "USD", label: "United States", flag: "🇺🇸", shipping: 8, freeOver: 150 },
  { code: "EUR", label: "Europe", flag: "🇪🇺", shipping: 7, freeOver: 140 },
  { code: "GBP", label: "United Kingdom", flag: "🇬🇧", shipping: 6, freeOver: 120 },
  { code: "JPY", label: "Japan", flag: "🇯🇵", shipping: 1200, freeOver: 22000 },
  { code: "AUD", label: "Australia", flag: "🇦🇺", shipping: 12, freeOver: 230 },
  { code: "CAD", label: "Canada", flag: "🇨🇦", shipping: 10, freeOver: 200 },
  { code: "SGD", label: "Singapore", flag: "🇸🇬", shipping: 10, freeOver: 200 },
] as const;

export type ShopCurrency = (typeof SHOP_CURRENCIES)[number]["code"];
export const DEFAULT_CURRENCY: ShopCurrency = "USD";

export function isShopCurrency(c: string | undefined): c is ShopCurrency {
  return !!c && SHOP_CURRENCIES.some((x) => x.code === c);
}

export function shippingFor(currency: ShopCurrency, subtotal: number) {
  const c = SHOP_CURRENCIES.find((x) => x.code === currency)!;
  return subtotal >= c.freeOver || subtotal === 0 ? 0 : c.shipping;
}
