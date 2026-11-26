import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma, Provider } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { roundCurrency, toUsd } from "@/lib/fx";
import { LOCAL_RECEIVING_ACCOUNTS } from "@/lib/mock/accounts";
import { adapterFor } from "@/lib/providers";
import { PROVIDER_META } from "@/lib/providers/meta";
import { isShopCurrency } from "@/lib/currency";

export const TOPUP_MIN_USD = 1;
export const TOPUP_MAX_USD = 10000;

export async function getOrCreateWallet(userId: string, currency: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.wallet.upsert({
    where: { userId_currency: { userId, currency } },
    create: { userId, currency },
    update: {},
  });
}

export function topupReference() {
  return `TU-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Ghi có ví cho giao dịch TOPUP đang PENDING – idempotent (webhook gọi lại cũng không cộng 2 lần).
 */
export async function completeTopup(walletTxId: string, externalRef?: string) {
  return prisma.$transaction(async (db) => {
    const claimed = await db.walletTransaction.updateMany({
      where: { id: walletTxId, status: "PENDING", type: "TOPUP" },
      data: { status: "COMPLETED", completedAt: new Date(), ...(externalRef ? { externalRef } : {}) },
    });
    if (claimed.count === 0) return false;
    const tx = await db.walletTransaction.findUniqueOrThrow({ where: { id: walletTxId } });
    const wallet = await db.wallet.update({ where: { id: tx.walletId }, data: { balance: { increment: tx.amount } } });
    await db.walletTransaction.update({ where: { id: tx.id }, data: { balanceAfter: wallet.balance } });
    return true;
  });
}

export async function failTopup(walletTxId: string, reason: string, externalRef?: string) {
  await prisma.walletTransaction.updateMany({
    where: { id: walletTxId, status: "PENDING" },
    data: { status: "FAILED", failReason: reason, completedAt: new Date(), ...(externalRef ? { externalRef } : {}) },
  });
}

export const TOPUP_SESSION_MINUTES = 15;
/** Nạp ≥ ngưỡng này (USD eq.) bằng thẻ sẽ yêu cầu 3-D Secure */
export const THREE_DS_THRESHOLD_USD = 100;
export const SANDBOX_OTP = "123456";

export type TopupMethod = "CARD" | "WALLET" | "BANK_TRANSFER";

export type CreateTopupInput = { currency: string; amount: number; method: TopupMethod; provider?: Provider };

const ERR: Record<string, string> = {
  CARD_DECLINED: "Ngân hàng phát hành từ chối giao dịch.",
  INSUFFICIENT_FUNDS: "Thẻ không đủ số dư.",
  EXPIRED_CARD: "Thẻ đã hết hạn.",
  INVALID_CARD_NUMBER: "Số thẻ không hợp lệ.",
  WALLET_OTP_INVALID: "Mã OTP không đúng.",
  WALLET_ACCOUNT_REQUIRED: "Nhập tài khoản ví.",
  CURRENCY_NOT_SUPPORTED: "Cổng thanh toán không hỗ trợ loại tiền này.",
};

const CARD_ORDER: Provider[] = ["PINGPONG", "WORLDFIRST", "PAYONEER"];

/** Bước 1: tạo phiên nạp tiền (PENDING) → chuyển sang trang thanh toán /pay/[id] */
export async function createTopup(userId: string, input: CreateTopupInput) {
  if (!isShopCurrency(input.currency)) return { ok: false as const, error: "Loại tiền không hỗ trợ" };
  const amount = roundCurrency(input.amount, input.currency);
  const usd = toUsd(amount, input.currency);
  if (!(amount > 0) || usd < TOPUP_MIN_USD || usd > TOPUP_MAX_USD)
    return { ok: false as const, error: `Số tiền nạp phải tương đương ${TOPUP_MIN_USD}–${TOPUP_MAX_USD.toLocaleString()} USD` };
  if (input.method === "BANK_TRANSFER" && !LOCAL_RECEIVING_ACCOUNTS[input.currency])
    return { ok: false as const, error: "Chưa có tài khoản nhận cho loại tiền này" };
  if (input.method === "WALLET" && !input.provider) return { ok: false as const, error: "Chọn ví" };

  const wallet = await getOrCreateWallet(userId, input.currency);
  const provider = input.method === "BANK_TRANSFER" ? "WORLDFIRST" : input.method === "CARD" ? CARD_ORDER[0] : input.provider!;
  const description =
    input.method === "BANK_TRANSFER"
      ? `Nạp ${input.currency} qua chuyển khoản nội địa`
      : input.method === "CARD"
        ? `Nạp ${input.currency} bằng thẻ`
        : `Nạp ${input.currency} từ ví ${PROVIDER_META[provider].label}`;

  const tx = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      userId,
      type: "TOPUP",
      direction: "IN",
      status: "PENDING",
      amount,
      currency: input.currency,
      method: input.method,
      provider,
      reference: topupReference(),
      description,
    },
  });
  return { ok: true as const, txId: tx.id };
}

/** Phiên thẻ/ví quá 15 phút chưa thanh toán → hủy */
export async function expireIfStale(txId: string) {
  const tx = await prisma.walletTransaction.findUnique({ where: { id: txId } });
  if (!tx || tx.status !== "PENDING" || tx.method === "BANK_TRANSFER") return tx;
  if (Date.now() - tx.createdAt.getTime() > TOPUP_SESSION_MINUTES * 60000) {
    await prisma.walletTransaction.update({
      where: { id: tx.id },
      data: { status: "CANCELLED", failReason: "Phiên thanh toán đã hết hạn", completedAt: new Date() },
    });
    return prisma.walletTransaction.findUnique({ where: { id: txId } });
  }
  return tx;
}

export async function cancelTopup(txId: string, userId: string) {
  await prisma.walletTransaction.updateMany({
    where: { id: txId, userId, status: "PENDING", type: "TOPUP" },
    data: { status: "CANCELLED", failReason: "Bạn đã hủy giao dịch", completedAt: new Date() },
  });
}

export type ConfirmPayload =
  | { method: "CARD"; card: { number: string; expiry: string; cvc: string; holder: string }; threeDsCode?: string }
  | { method: "WALLET"; wallet: { account: string; otp: string } };

export type ConfirmResult =
  | { status: "COMPLETED" }
  | { status: "REQUIRES_3DS"; last4: string; brand: string; error?: string }
  | { status: "FAILED"; error: string }
  | { status: "ERROR"; error: string };

function cardBrand(n: string) {
  return n.startsWith("4") ? "Visa" : /^5[1-5]|^2[2-7]/.test(n) ? "Mastercard" : /^3[47]/.test(n) ? "Amex" : /^35/.test(n) ? "JCB" : "Card";
}

function luhn(n: string) {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Bước 2: khách xác nhận trên trang thanh toán → gọi cổng (PingPong/Payoneer/WorldFirst) → ghi có ví */
export async function confirmTopup(user: { id: string; name: string; email: string }, txId: string, p: ConfirmPayload): Promise<ConfirmResult> {
  const tx = await expireIfStale(txId);
  if (!tx || tx.userId !== user.id) return { status: "ERROR", error: "Không tìm thấy giao dịch" };
  if (tx.status !== "PENDING") return { status: "ERROR", error: "Giao dịch đã kết thúc" };
  if (tx.method !== p.method) return { status: "ERROR", error: "Sai phương thức" };

  if (p.method === "CARD") {
    const n = p.card.number.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(n) || !luhn(n)) return { status: "ERROR", error: "Số thẻ không hợp lệ" };
    const [mm, yy] = p.card.expiry.split("/").map((x) => Number(x.trim()));
    const now = new Date();
    if (!mm || mm > 12 || !yy || 2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1))
      return { status: "ERROR", error: "Ngày hết hạn không hợp lệ" };
    if (!/^\d{3,4}$/.test(p.card.cvc)) return { status: "ERROR", error: "CVC không hợp lệ" };
    // 3-D Secure: số tiền lớn hoặc thẻ test 4000 0027 6000 3184
    const needs3ds = toUsd(Number(tx.amount), tx.currency) >= THREE_DS_THRESHOLD_USD || n === "4000002760003184";
    if (needs3ds && p.threeDsCode === undefined) return { status: "REQUIRES_3DS", last4: n.slice(-4), brand: cardBrand(n) };
    if (needs3ds && p.threeDsCode !== SANDBOX_OTP) {
      return { status: "REQUIRES_3DS", last4: n.slice(-4), brand: cardBrand(n), error: "Mã xác thực không đúng" };
    }
  }

  const providers = p.method === "CARD" ? CARD_ORDER : [tx.provider!];
  let lastError = "Không có cổng thanh toán khả dụng";
  for (const provider of providers) {
    const account = await prisma.account.findFirst({ where: { provider, enabled: true, NOT: { baseUrl: { startsWith: "import://" } } }, orderBy: { createdAt: "asc" } });
    if (!account) continue;
    let res;
    try {
      res = await adapterFor(account).checkout({
        method: p.method,
        amount: Number(tx.amount),
        currency: tx.currency,
        orderRef: tx.reference,
        description: `Wallet top-up ${tx.reference}`,
        payer: { name: user.name, email: user.email },
        card: p.method === "CARD" ? { number: p.card.number, expiry: p.card.expiry, cvc: p.card.cvc } : undefined,
        wallet: p.method === "WALLET" ? p.wallet : undefined,
      });
    } catch (e) {
      lastError = `Không kết nối được ${PROVIDER_META[provider].label}: ${e instanceof Error ? e.message : e}`;
      continue;
    }
    if (res.ok) {
      await prisma.walletTransaction.update({ where: { id: tx.id }, data: { provider } });
      await completeTopup(tx.id, res.externalId);
      return { status: "COMPLETED" };
    }
    if (res.error === "CURRENCY_NOT_SUPPORTED" && p.method === "CARD") continue;
    // OTP ví sai: cho nhập lại, chưa hủy giao dịch
    if (res.error === "WALLET_OTP_INVALID") return { status: "ERROR", error: ERR.WALLET_OTP_INVALID };
    lastError = ERR[res.error ?? ""] ?? `Giao dịch bị từ chối (${res.error})`;
    await prisma.walletTransaction.update({ where: { id: tx.id }, data: { provider } });
    await failTopup(tx.id, lastError, res.externalId);
    return { status: "FAILED", error: lastError };
  }
  await failTopup(tx.id, lastError);
  return { status: "FAILED", error: lastError };
}

/** Trừ ví để thanh toán đơn – atomic: chỉ trừ khi đủ số dư */
export async function payOrderWithWallet(userId: string, orderId: string) {
  return prisma.$transaction(async (db) => {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.userId !== userId) throw new Error("Không phải đơn của bạn");
    if (!["PENDING_PAYMENT", "FAILED"].includes(order.status)) return { ok: false as const, error: "Đơn không ở trạng thái chờ thanh toán" };

    const debited = await db.wallet.updateMany({
      where: { userId, currency: order.currency, balance: { gte: order.total } },
      data: { balance: { decrement: order.total } },
    });
    if (debited.count === 0) {
      const w = await db.wallet.findUnique({ where: { userId_currency: { userId, currency: order.currency } } });
      const short = roundCurrency(Number(order.total) - Number(w?.balance ?? 0), order.currency);
      return { ok: false as const, error: `Ví ${order.currency} không đủ, còn thiếu ${short} ${order.currency}`, shortfall: short };
    }
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId_currency: { userId, currency: order.currency } } });
    const wtx = await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: "PAYMENT",
        direction: "OUT",
        status: "COMPLETED",
        amount: order.total,
        currency: order.currency,
        balanceAfter: wallet.balance,
        method: "STORE_WALLET",
        reference: `PAY-${order.number}-${Date.now().toString(36).toUpperCase()}`,
        orderId: order.id,
        description: `Thanh toán đơn ${order.number}`,
        completedAt: new Date(),
      },
    });
    await db.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date(), paymentMethod: "STORE_WALLET", provider: null, paymentRef: wtx.reference },
    });
    await db.paymentEvent.create({
      data: {
        orderId: order.id,
        type: "wallet.debited",
        message: `Trừ ví ${order.currency}: ${order.total} – số dư còn ${wallet.balance}`,
        data: { walletTxId: wtx.id, balanceAfter: wallet.balance.toString() },
      },
    });
    return { ok: true as const, walletTxId: wtx.id };
  });
}
