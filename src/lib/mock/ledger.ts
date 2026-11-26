/**
 * Mock ledger: nguồn dữ liệu nội bộ của các "provider giả lập".
 *
 *  - Lịch sử nền: sinh deterministic theo (merchant, khe 15 phút) → cùng 1 merchant
 *    luôn ra cùng 1 lịch sử, và giao dịch mới tự xuất hiện theo thời gian thực.
 *  - Giao dịch từ storefront: lưu ở bảng MockPayment (do mock checkout ghi).
 *  - Trạng thái PENDING tự chuyển sang COMPLETED/FAILED sau "settle delay" → test được
 *    việc sync cập nhật trạng thái.
 */
import { prisma } from "@/lib/db";
import { USD_RATES, roundCurrency } from "@/lib/fx";
import type { MockMerchant } from "./accounts";
import { hash, pick, rng, weighted } from "./rng";

export type MockKind =
  | "COLLECTION"
  | "TRANSFER_IN"
  | "WITHDRAWAL"
  | "PAYMENT"
  | "CARD"
  | "FX"
  | "FEE"
  | "REFUND";

export type MockStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface MockTx {
  id: string;
  time: Date;
  kind: MockKind;
  direction: "IN" | "OUT";
  currency: string;
  amount: number;
  fee: number;
  status: MockStatus;
  counterparty: string;
  description: string;
  reference: string;
  counterCurrency?: string;
  counterAmount?: number;
  rate?: number;
  /** storefront | history */
  source: "history" | "storefront";
  channel?: string;
}

const HISTORY_DAYS = 120;
const SLOT_MS = 15 * 60 * 1000;
const TX_PROBABILITY = 0.1;

const KIND_WEIGHTS: [MockKind, number][] = [
  ["COLLECTION", 40],
  ["TRANSFER_IN", 8],
  ["WITHDRAWAL", 10],
  ["PAYMENT", 14],
  ["CARD", 14],
  ["FX", 6],
  ["FEE", 5],
  ["REFUND", 3],
];

const USD_RANGE: Record<MockKind, [number, number]> = {
  COLLECTION: [50, 4000],
  TRANSFER_IN: [200, 8000],
  WITHDRAWAL: [300, 4000],
  PAYMENT: [100, 3000],
  CARD: [5, 800],
  FX: [100, 1500],
  FEE: [1, 40],
  REFUND: [10, 300],
};

const SOURCES: Record<string, string[]> = {
  PINGPONG: ["Amazon US", "Amazon EU", "Shopify Payments", "Walmart Marketplace", "TikTok Shop", "Etsy"],
  PAYONEER: ["Amazon US", "Upwork Global Inc.", "Fiverr", "Walmart Marketplace", "eBay", "Wish"],
  WORLDFIRST: ["Amazon JP", "Amazon UK", "Lazada", "Shopee", "Alibaba.com", "Shopify Payments"],
};
const PAYERS = ["Acme Retail LLC", "Nordic Goods AB", "Kensington Traders Ltd", "Maple Leaf Imports", "Sydney Supply Pty"];
const SUPPLIERS = ["Shenzhen Yida Textile Co.", "Guangzhou Leather Works", "Hangzhou Silk Factory", "DHL Express", "FedEx", "Yiwu Accessories Ltd"];
const CARD_MERCHANTS = ["Facebook Ads", "Google Ads", "TikTok Ads", "Shopify Subscription", "Canva Pro", "AWS"];
const BANKS = ["Vietcombank ****8812", "Techcombank ****2207", "ACB ****1190", "BIDV ****5521"];

function logUniform(r: () => number, [min, max]: [number, number]) {
  return Math.exp(Math.log(min) + r() * (Math.log(max) - Math.log(min)));
}

function idFor(m: MockMerchant, slot: number) {
  const h = hash(`${m.key}:${slot}`);
  const h2 = hash(`${slot}:${m.key}:x`);
  switch (m.provider) {
    case "PINGPONG":
      return `PP${h.toString().padStart(10, "0")}${(h2 % 1e6).toString().padStart(6, "0")}`;
    case "PAYONEER":
      return `${(h % 9e8) + 1e8}${(h2 % 1e4).toString().padStart(4, "0")}`;
    default:
      return `2026${h.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`.toUpperCase();
  }
}

function genSlot(m: MockMerchant, slot: number, now: number): MockTx | null {
  const r = rng(hash(`${m.provider}:${m.key}:${slot}`));
  if (r() > TX_PROBABILITY) return null;

  const time = new Date(slot * SLOT_MS + Math.floor(r() * SLOT_MS));
  if (time.getTime() > now) return null;

  const kind = weighted(r, KIND_WEIGHTS);
  const others = m.currencies.filter((c) => c !== m.primary);
  // Rút tiền luôn từ ví chính; FX: đổi từ ví phụ (EUR/GBP…) về ví chính
  const currency =
    others.length === 0 || kind === "WITHDRAWAL"
      ? m.primary
      : kind === "FX"
        ? pick(r, others)
        : r() < 0.55
          ? m.primary
          : pick(r, others);
  const usd = logUniform(r, USD_RANGE[kind]);
  const amount = roundCurrency(usd / USD_RATES[currency], currency);

  const direction: "IN" | "OUT" = ["COLLECTION", "TRANSFER_IN"].includes(kind) ? "IN" : "OUT";
  let fee = 0;
  if (kind === "COLLECTION") fee = roundCurrency(amount * 0.01, currency);
  if (kind === "WITHDRAWAL") fee = roundCurrency(amount * 0.003, currency);

  // trạng thái theo thời gian: pending → completed/failed
  const settleMs = (5 + r() * 240) * 60 * 1000;
  const failed = direction === "OUT" && kind !== "FEE" && r() < 0.03;
  const status: MockStatus =
    now - time.getTime() < settleMs ? "PENDING" : failed ? "FAILED" : "COMPLETED";

  const src = SOURCES[m.provider];
  let counterparty = "";
  let description = "";
  let counterCurrency: string | undefined;
  let counterAmount: number | undefined;
  let rate: number | undefined;

  switch (kind) {
    case "COLLECTION":
      counterparty = pick(r, src);
      description = `Settlement ${counterparty} #${Math.floor(r() * 1e6)}`;
      break;
    case "TRANSFER_IN":
      counterparty = pick(r, PAYERS);
      description = `Inbound transfer from ${counterparty}`;
      break;
    case "WITHDRAWAL":
      counterparty = pick(r, BANKS);
      description = `Withdrawal to ${counterparty} (VND)`;
      break;
    case "PAYMENT":
      counterparty = pick(r, SUPPLIERS);
      description = `Supplier payment – PO-${Math.floor(r() * 90000 + 10000)}`;
      break;
    case "CARD":
      counterparty = pick(r, CARD_MERCHANTS);
      description = `Card ****${Math.floor(r() * 9000 + 1000)} – ${counterparty}`;
      break;
    case "FX": {
      counterCurrency = m.primary;
      const mid = USD_RATES[currency] / USD_RATES[counterCurrency];
      rate = Math.round(mid * (1 - 0.004) * 1e6) / 1e6; // spread 0.4%
      counterAmount = roundCurrency(amount * rate, counterCurrency);
      counterparty = "FX Desk";
      description = `Convert ${currency} → ${counterCurrency}`;
      break;
    }
    case "FEE":
      counterparty = m.provider;
      description = pick(r, ["Monthly account fee", "Inactivity fee", "Card issuance fee", "Chargeback fee"]);
      break;
    case "REFUND":
      counterparty = pick(r, src);
      description = `Refund order #${Math.floor(r() * 1e6)}`;
      break;
  }

  return {
    id: idFor(m, slot),
    time,
    kind,
    direction,
    currency,
    amount,
    fee,
    status,
    counterparty,
    description,
    reference: `REF${hash(`${slot}${m.key}ref`).toString(36).toUpperCase()}`,
    counterCurrency,
    counterAmount,
    rate,
    source: "history",
  };
}

function historyStart(now: number) {
  return Math.floor((now - HISTORY_DAYS * 86400000) / SLOT_MS);
}

function generateHistory(m: MockMerchant, from: Date, to: Date, now = Date.now()): MockTx[] {
  const startSlot = Math.max(historyStart(now), Math.floor(from.getTime() / SLOT_MS));
  const endSlot = Math.floor(Math.min(to.getTime(), now) / SLOT_MS);
  const out: MockTx[] = [];
  for (let s = startSlot; s <= endSlot; s++) {
    const tx = genSlot(m, s, now);
    if (tx && tx.time >= from && tx.time <= to) out.push(tx);
  }
  return out;
}

async function storefrontTxs(m: MockMerchant, from: Date, to: Date): Promise<MockTx[]> {
  const rows = await prisma.mockPayment.findMany({
    where: { provider: m.provider, merchantKey: m.key, createdAt: { gte: from, lte: to } },
  });
  return rows.map((p) => ({
    id: p.externalId,
    time: p.createdAt,
    kind: "COLLECTION" as const,
    direction: "IN" as const,
    currency: p.currency,
    amount: Number(p.amount),
    fee: Number(p.fee),
    status: p.status as MockStatus,
    counterparty: p.payerName,
    description: p.description ?? "Storefront payment",
    reference: p.reference ?? "",
    source: "storefront" as const,
    channel: p.kind,
  }));
}

/** Tất cả giao dịch trong khoảng thời gian, mới nhất trước */
export async function getLedger(m: MockMerchant, from: Date, to: Date): Promise<MockTx[]> {
  const [hist, store] = await Promise.all([
    Promise.resolve(generateHistory(m, from, to)),
    storefrontTxs(m, from, to),
  ]);
  return [...hist, ...store].sort((a, b) => b.time.getTime() - a.time.getTime());
}

export interface MockBalance {
  currency: string;
  available: number;
  pending: number;
}

export async function getBalances(m: MockMerchant): Promise<MockBalance[]> {
  const now = Date.now();
  const from = new Date(historyStart(now) * SLOT_MS);
  const txs = await getLedger(m, from, new Date(now));
  const bal = new Map<string, MockBalance>();
  for (const c of m.currencies) {
    const openingUsd = c === m.primary ? 20000 : 8000;
    bal.set(c, { currency: c, available: roundCurrency(openingUsd / USD_RATES[c], c), pending: 0 });
  }
  const get = (c: string) => {
    if (!bal.has(c)) bal.set(c, { currency: c, available: 0, pending: 0 });
    return bal.get(c)!;
  };
  for (const t of txs) {
    const b = get(t.currency);
    if (t.status === "PENDING") {
      if (t.direction === "IN") b.pending += t.amount - t.fee;
      continue;
    }
    if (t.status !== "COMPLETED") continue;
    b.available += t.direction === "IN" ? t.amount - t.fee : -(t.amount + t.fee);
    if (t.kind === "FX" && t.counterCurrency && t.counterAmount) get(t.counterCurrency).available += t.counterAmount;
  }
  return [...bal.values()].map((b) => ({
    currency: b.currency,
    available: roundCurrency(b.available, b.currency),
    pending: roundCurrency(b.pending, b.currency),
  }));
}

/** Giả lập lỗi mạng ngẫu nhiên (MOCK_FAILURE_RATE=0.1 → 10% request lỗi 503) */
export function shouldFail() {
  const rate = Number(process.env.MOCK_FAILURE_RATE ?? 0);
  return rate > 0 && Math.random() < rate;
}
