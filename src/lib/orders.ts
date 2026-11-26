import "server-only";
import { randomBytes } from "node:crypto";
import type { Order, Prisma, Provider } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { roundCurrency } from "@/lib/fx";
import { isShopCurrency, shippingFor } from "@/lib/currency";
import { adapterFor } from "@/lib/providers";
import { PROVIDER_META } from "@/lib/providers/meta";
import type { CheckoutRequest } from "@/lib/providers/types";
import { payOrderWithWallet } from "@/lib/wallet";

export type PaymentInput =
  | { method: "CARD"; card: { number: string; expiry: string; cvc: string; holder: string } }
  | { method: "WALLET"; provider: Provider; wallet: { account: string; otp: string } }
  | { method: "BANK_TRANSFER" }
  | { method: "STORE_WALLET" };

export interface CheckoutInput {
  userId: string;
  orderId?: string;
  currency: string;
  items: { productId: string; quantity: number }[];
  customer: { email: string; name: string; country: string; address: string };
  payment: PaymentInput;
}

export type CheckoutOutcome =
  | { ok: true; orderId: string; status: Order["status"] }
  | { ok: false; orderId?: string; error: string; shortfall?: number };

/** Thứ tự provider xử lý thẻ (fallback nếu provider đầu không hỗ trợ currency) */
const CARD_PROVIDERS: Provider[] = ["PINGPONG", "WORLDFIRST", "PAYONEER"];
const BANK_PROVIDER: Provider = "WORLDFIRST";

const ERROR_TEXT: Record<string, string> = {
  CARD_DECLINED: "Thẻ bị từ chối. Thử thẻ khác.",
  INSUFFICIENT_FUNDS: "Thẻ không đủ số dư.",
  EXPIRED_CARD: "Thẻ đã hết hạn.",
  INVALID_CARD_NUMBER: "Số thẻ không hợp lệ.",
  WALLET_OTP_INVALID: "Mã OTP ví không đúng (demo: 123456).",
  WALLET_ACCOUNT_REQUIRED: "Nhập email/tài khoản ví.",
  CURRENCY_NOT_SUPPORTED: "Provider này chưa có ví cho loại tiền tệ này.",
};

function orderNumber() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear() % 100}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `OP-${ymd}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function logEvent(orderId: string, type: string, message: string, data?: unknown) {
  await prisma.paymentEvent.create({ data: { orderId, type, message, data: (data ?? undefined) as Prisma.InputJsonValue | undefined } });
}

async function receivingAccount(provider: Provider) {
  return prisma.account.findFirst({ where: { provider, enabled: true }, orderBy: { createdAt: "asc" } });
}

async function createOrder(input: CheckoutInput) {
  if (!isShopCurrency(input.currency)) throw new Error("Currency không hỗ trợ");
  const items = input.items.filter((i) => i.quantity > 0);
  if (!items.length) throw new Error("Giỏ hàng trống");

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, active: true },
    include: { prices: { where: { currency: input.currency } } },
  });

  const lines = items.map((i) => {
    const p = products.find((x) => x.id === i.productId);
    if (!p || !p.prices[0]) throw new Error("Sản phẩm không còn bán ở thị trường này");
    const unit = Number(p.prices[0].amount);
    return { productId: p.id, name: p.name, quantity: Math.min(i.quantity, 20), unitPrice: unit, lineTotal: roundCurrency(unit * Math.min(i.quantity, 20), input.currency) };
  });
  const subtotal = roundCurrency(lines.reduce((s, l) => s + l.lineTotal, 0), input.currency);
  const shipping = shippingFor(input.currency, subtotal);

  const order = await prisma.order.create({
    data: {
      number: orderNumber(),
      userId: input.userId,
      email: input.customer.email,
      customerName: input.customer.name,
      country: input.customer.country,
      address: input.customer.address,
      currency: input.currency,
      subtotal,
      shipping,
      total: roundCurrency(subtotal + shipping, input.currency),
      items: { create: lines },
    },
  });
  await logEvent(order.id, "order.created", `Tạo đơn ${order.number} – ${order.total} ${order.currency}`);
  return order;
}

export async function checkout(input: CheckoutInput): Promise<CheckoutOutcome> {
  let order: Order;
  try {
    if (input.orderId) {
      const existing = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!existing || existing.userId !== input.userId || !["PENDING_PAYMENT", "FAILED"].includes(existing.status)) {
        return { ok: false, error: "Đơn hàng không thể thanh toán lại" };
      }
      order = existing;
    } else {
      order = await createOrder(input);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không tạo được đơn" };
  }

  const p = input.payment;
  const amount = Number(order.total);

  // ── Ví cửa hàng (số dư đã nạp) ──────────────────────
  if (p.method === "STORE_WALLET") {
    await logEvent(order.id, "payment.initiated", `Thanh toán bằng số dư ví ${order.currency}`);
    const r = await payOrderWithWallet(input.userId, order.id);
    if (r.ok) return { ok: true, orderId: order.id, status: "PAID" };
    await logEvent(order.id, "payment.failed", r.error);
    return { ok: false, orderId: order.id, error: r.error, shortfall: "shortfall" in r ? r.shortfall : undefined };
  }

  // ── Chuyển khoản local ───────────────────────────────
  if (p.method === "BANK_TRANSFER") {
    const ref = order.bankReference ?? `OP${randomBytes(3).toString("hex").toUpperCase()}`;
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "AWAITING_TRANSFER", paymentMethod: "BANK_TRANSFER", provider: BANK_PROVIDER, bankReference: ref },
    });
    await logEvent(order.id, "transfer.instructions_issued", `Cấp tài khoản nhận ${order.currency} local qua WorldFirst, nội dung CK: ${ref}`, { reference: ref });
    return { ok: true, orderId: order.id, status: "AWAITING_TRANSFER" };
  }

  // ── Thẻ / Ví ─────────────────────────────────────────
  const providers = p.method === "CARD" ? CARD_PROVIDERS : [p.provider];
  const req: CheckoutRequest = {
    method: p.method,
    amount,
    currency: order.currency,
    orderRef: order.number,
    description: `Order ${order.number}`,
    payer: { name: order.customerName, email: order.email },
    card: p.method === "CARD" ? { number: p.card.number, expiry: p.card.expiry, cvc: p.card.cvc } : undefined,
    wallet: p.method === "WALLET" ? p.wallet : undefined,
  };

  let lastError = "Không có tài khoản nhận tiền khả dụng";
  for (const provider of providers) {
    const account = await receivingAccount(provider);
    if (!account) continue;
    const label = PROVIDER_META[provider].label;
    await logEvent(order.id, "payment.initiated", `Gửi yêu cầu ${p.method === "CARD" ? "thanh toán thẻ" : "thanh toán ví"} tới ${label}`, { provider, amount, currency: order.currency });

    let res;
    try {
      res = await adapterFor(account).checkout(req);
    } catch (e) {
      lastError = `Lỗi kết nối ${label}`;
      await logEvent(order.id, "payment.error", `${lastError}: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (res.ok) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date(), paymentMethod: p.method, provider, paymentRef: res.externalId },
      });
      await logEvent(order.id, "payment.captured", `${label} xác nhận thanh toán thành công – mã GD ${res.externalId}`, {
        provider,
        externalId: res.externalId,
        fee: res.fee,
        response: res.raw,
      });
      return { ok: true, orderId: order.id, status: "PAID" };
    }

    if (res.error === "CURRENCY_NOT_SUPPORTED" && p.method === "CARD") {
      await logEvent(order.id, "payment.rerouted", `${label} không có ví ${order.currency} → chuyển provider khác`);
      continue;
    }

    lastError = ERROR_TEXT[res.error ?? ""] ?? `Thanh toán thất bại (${res.error})`;
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED", paymentMethod: p.method, provider, paymentRef: res.externalId } });
    await logEvent(order.id, "payment.failed", `${label}: ${lastError}`, { provider, externalId: res.externalId, response: res.raw });
    return { ok: false, orderId: order.id, error: lastError };
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
  await logEvent(order.id, "payment.failed", lastError);
  return { ok: false, orderId: order.id, error: lastError };
}

/** Sandbox: giả lập khách chuyển khoản local vào virtual account */
export async function simulateInboundTransfer(orderId: string, amountOverride?: number) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "AWAITING_TRANSFER" || !order.bankReference) throw new Error("Đơn không ở trạng thái chờ chuyển khoản");
  const account = await receivingAccount(BANK_PROVIDER);
  if (!account) throw new Error("Chưa có tài khoản WorldFirst");
  const amount = amountOverride ?? Number(order.total);
  await logEvent(order.id, "transfer.sent", `(Sandbox) Khách chuyển ${amount} ${order.currency} với nội dung ${order.bankReference}`);
  const res = await fetch(`${account.baseUrl.replace(/\/$/, "")}/sandbox/simulate-inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      merchantKey: account.externalAccountId,
      amount,
      currency: order.currency,
      reference: order.bankReference,
      payerName: order.customerName,
    }),
  });
  if (!res.ok) throw new Error(`Sandbox lỗi HTTP ${res.status}`);
}

/** Sandbox: giả lập chuyển khoản nạp ví */
export async function simulateTopupTransfer(walletTxId: string, userId: string) {
  const tx = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: walletTxId } });
  if (tx.userId !== userId || tx.status !== "PENDING" || tx.method !== "BANK_TRANSFER") throw new Error("Giao dịch không chờ chuyển khoản");
  const account = await receivingAccount(BANK_PROVIDER);
  if (!account) throw new Error("Chưa có tài khoản WorldFirst");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await fetch(`${account.baseUrl.replace(/\/$/, "")}/sandbox/simulate-inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantKey: account.externalAccountId, amount: Number(tx.amount), currency: tx.currency, reference: tx.reference, payerName: user.name }),
  });
  if (!res.ok) throw new Error(`Sandbox lỗi HTTP ${res.status}`);
}
