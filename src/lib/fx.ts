/**
 * Tỷ giá tham chiếu quy đổi về USD để tổng hợp dashboard.
 * Production: thay bằng bảng FxRate cập nhật hằng ngày (vd. từ exchangerate.host / ngân hàng).
 */
export const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  CNY: 0.138,
  HKD: 0.128,
  CAD: 0.73,
  AUD: 0.66,
  SGD: 0.74,
  VND: 0.000039,
};

/** Số chữ số thập phân theo ISO 4217 */
export const CURRENCY_DECIMALS: Record<string, number> = { JPY: 0, VND: 0, KRW: 0 };

export function decimalsOf(currency: string) {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

export function toUsd(amount: number, currency: string) {
  const rate = USD_RATES[currency];
  if (rate === undefined) return 0;
  return Math.round(amount * rate * 10000) / 10000;
}

export function roundCurrency(amount: number, currency: string) {
  const f = 10 ** decimalsOf(currency);
  return Math.round(amount * f) / f;
}

export function formatMoney(amount: number | string, currency: string) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const d = decimalsOf(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n);
  } catch {
    return `${n.toFixed(d)} ${currency}`;
  }
}
