import { NextResponse } from "next/server";
import type { MockMerchant } from "./accounts";
import { evaluateTestCard, recordPayment } from "./gateway";

export type Ctx = { params: Promise<{ path: string[] }> };

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export function paginate<T>(items: T[], page: number, size: number) {
  const p = Math.max(1, page || 1);
  const s = Math.min(200, Math.max(1, size || 50));
  return { page: p, size: s, total: items.length, items: items.slice((p - 1) * s, p * s) };
}

export interface CheckoutBody {
  method: "CARD" | "WALLET";
  amount: number;
  currency: string;
  orderRef: string;
  description?: string;
  payer: { name: string; email?: string };
  card?: { number: string; expiry: string; cvc: string };
  wallet?: { account: string; otp: string };
}

/** Logic checkout dùng chung, mỗi provider bọc lại theo format riêng */
export async function runCheckout(m: MockMerchant, b: CheckoutBody) {
  if (!m.currencies.includes(b.currency))
    return { ok: false as const, code: "CURRENCY_NOT_SUPPORTED", message: `${b.currency} không được hỗ trợ` };

  let failReason: string | undefined;
  let meta: Record<string, unknown> = {};
  if (b.method === "CARD") {
    const c = evaluateTestCard(b.card?.number ?? "");
    if (!c.ok) failReason = c.reason;
    meta = { brand: c.brand, last4: (b.card?.number ?? "").replace(/\s/g, "").slice(-4) };
  } else {
    if (!b.wallet?.account) failReason = "wallet_account_required";
    else if (b.wallet.otp !== "123456") failReason = "wallet_otp_invalid";
    meta = { walletAccount: b.wallet?.account };
  }

  const payment = await recordPayment({
    provider: m.provider,
    merchantKey: m.key,
    kind: b.method === "CARD" ? "CARD_ACQUIRING" : "WALLET_PAY",
    amount: b.amount,
    currency: b.currency,
    status: failReason ? "FAILED" : "COMPLETED",
    payerName: b.payer.name,
    payerEmail: b.payer.email,
    reference: b.orderRef,
    description: b.description,
    meta: { ...meta, failReason },
  });

  return failReason
    ? { ok: false as const, code: failReason.toUpperCase(), message: failReason, payment }
    : { ok: true as const, payment };
}
