import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { encryptJson } from "../src/lib/crypto";
import { MOCK_MERCHANTS } from "../src/lib/mock/accounts";
import { PROVIDER_META } from "../src/lib/providers/meta";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fintrack?schema=public" }) });
const APP_URL = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://127.0.0.1:3000");

const PRODUCTS = [
  { slug: "canvas-tote", name: "Everyday Canvas Tote", category: "Bags", image: "tote", usd: 39, color: "Sand", description: "Túi tote canvas dày 16oz, quai da thật, ngăn trong có khóa kéo." },
  { slug: "field-watch", name: "Field Watch 38mm", category: "Watches", image: "watch", usd: 149, color: "Slate", description: "Đồng hồ cơ dáng field, kính sapphire, chống nước 100m." },
  { slug: "court-sneaker", name: "Court Sneaker", category: "Shoes", image: "sneaker", usd: 89, color: "White / Green", description: "Sneaker da trơn đế cao su lưu hóa, đi êm cả ngày." },
  { slug: "aviator-shades", name: "Midnight Shades", category: "Eyewear", image: "sunglasses", usd: 59, color: "Black", description: "Kính râm tròng phân cực UV400, gọng acetate." },
  { slug: "silk-scarf", name: "Hoi An Silk Scarf", category: "Accessories", image: "scarf", usd: 45, color: "Rose", description: "Khăn lụa tơ tằm dệt tay Hội An, 90×90cm." },
  { slug: "classic-cap", name: "Classic 6-Panel Cap", category: "Accessories", image: "cap", usd: 25, color: "Cobalt", description: "Mũ lưỡi trai cotton twill, khóa đồng điều chỉnh." },
  { slug: "city-backpack", name: "City Backpack 20L", category: "Bags", image: "backpack", usd: 119, color: "Olive", description: "Balo chống nước, ngăn laptop 16\", quai đệm thoáng khí." },
  { slug: "slim-wallet", name: "Slim Leather Wallet", category: "Accessories", image: "wallet", usd: 35, color: "Cognac", description: "Ví da bò thật, 6 ngăn thẻ, chặn RFID." },
  { slug: "fleece-hoodie", name: "Heavyweight Hoodie", category: "Apparel", image: "hoodie", usd: 69, color: "Violet", description: "Hoodie nỉ bông 450gsm, form boxy." },
  { slug: "organic-tee", name: "Organic Cotton Tee", category: "Apparel", image: "tee", usd: 29, color: "Mustard", description: "Áo thun cotton hữu cơ 220gsm, nhuộm tự nhiên." },
  { slug: "jade-bracelet", name: "Jade Bead Bracelet", category: "Jewelry", image: "bracelet", usd: 55, color: "Teal", description: "Vòng tay đá ngọc bích, charm mạ vàng 18k." },
  { slug: "leather-belt", name: "Full-grain Belt", category: "Accessories", image: "belt", usd: 49, color: "Charcoal", description: "Thắt lưng da nguyên tấm, khóa đồng thau." },
];

/** Giá local hóa (không phải quy đổi tỷ giá cứng): làm tròn kiểu .99 / bội số 100 yên */
const MARKET: Record<string, { factor: number; round: (n: number) => number }> = {
  USD: { factor: 1, round: (n) => Math.ceil(n) - 0.01 },
  EUR: { factor: 0.95, round: (n) => Math.ceil(n) - 0.01 },
  GBP: { factor: 0.82, round: (n) => Math.ceil(n) - 0.01 },
  JPY: { factor: 152, round: (n) => Math.ceil(n / 100) * 100 },
  AUD: { factor: 1.55, round: (n) => Math.ceil(n) - 0.05 },
  CAD: { factor: 1.38, round: (n) => Math.ceil(n) - 0.01 },
  SGD: { factor: 1.36, round: (n) => Math.ceil(n) - 0.1 },
};

async function main() {
  // Tài khoản "clone" → trỏ tới mock API của chính app
  for (const m of MOCK_MERCHANTS) {
    const baseUrl = `${APP_URL}${PROVIDER_META[m.provider].mockPath}`;
    await prisma.account.upsert({
      where: { externalAccountId: m.key },
      create: { provider: m.provider, name: m.name, baseUrl, credentials: encryptJson(m.credentials), externalAccountId: m.key },
      update: { baseUrl, credentials: encryptJson(m.credentials) },
    });
  }

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, name: p.name, category: p.category, description: p.description, image: `/products/${p.image}.svg`, color: p.color },
      update: { name: p.name, description: p.description, image: `/products/${p.image}.svg` },
    });
    for (const [currency, mk] of Object.entries(MARKET)) {
      const amount = Math.round(mk.round(p.usd * mk.factor) * 100) / 100;
      await prisma.productPrice.upsert({
        where: { productId_currency: { productId: product.id, currency } },
        create: { productId: product.id, currency, amount },
        update: { amount },
      });
    }
  }
  await seedUsers();
  console.log(`Seeded ${MOCK_MERCHANTS.length} accounts, ${PRODUCTS.length} products, demo users`);
}

function hash(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(pw, salt, 64).toString("base64")}`;
}

const ago = (h: number) => new Date(Date.now() - h * 3600000);

async function seedUsers() {
  const users = [
    { email: "admin@onepage.demo", name: "Admin Onepage", password: "admin123", role: "ADMIN" as const },
    { email: "user1@onepage.demo", name: "Nguyễn Văn A", password: "123456", role: "CUSTOMER" as const },
    { email: "user2@onepage.demo", name: "Emma Schmidt", password: "123456", role: "CUSTOMER" as const },
  ];
  for (const u of users) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (exists) continue;
    const user = await prisma.user.create({ data: { email: u.email, name: u.name, role: u.role, passwordHash: hash(u.password) } });
    if (u.email !== "user1@onepage.demo") continue;

    // Lịch sử ví mẫu cho user1
    const balances: Record<string, number> = {};
    const wallets: Record<string, string> = {};
    async function entry(e: {
      type: "TOPUP" | "PAYMENT" | "REFUND";
      status: "COMPLETED" | "FAILED";
      amount: number;
      currency: string;
      method: string;
      provider?: "PINGPONG" | "PAYONEER" | "WORLDFIRST";
      description: string;
      hoursAgo: number;
      orderId?: string;
      failReason?: string;
    }) {
      if (!wallets[e.currency]) {
        const w = await prisma.wallet.create({ data: { userId: user.id, currency: e.currency } });
        wallets[e.currency] = w.id;
        balances[e.currency] = 0;
      }
      const dir = e.type === "PAYMENT" ? "OUT" : "IN";
      if (e.status === "COMPLETED") balances[e.currency] += dir === "IN" ? e.amount : -e.amount;
      await prisma.walletTransaction.create({
        data: {
          walletId: wallets[e.currency],
          userId: user.id,
          type: e.type,
          direction: dir,
          status: e.status,
          amount: e.amount,
          currency: e.currency,
          balanceAfter: e.status === "COMPLETED" ? balances[e.currency] : null,
          method: e.method,
          provider: e.provider,
          externalRef: e.method === "STORE_WALLET" ? null : `SEED${randomBytes(5).toString("hex").toUpperCase()}`,
          reference: `${e.type === "PAYMENT" ? "PAY" : "TU"}-SEED${randomBytes(3).toString("hex").toUpperCase()}`,
          orderId: e.orderId,
          description: e.description,
          failReason: e.failReason,
          createdAt: ago(e.hoursAgo),
          completedAt: ago(e.hoursAgo - 0.01),
        },
      });
    }

    await entry({ type: "TOPUP", status: "COMPLETED", amount: 500, currency: "USD", method: "WALLET", provider: "PINGPONG", description: "Nạp USD từ ví PingPong", hoursAgo: 240 });
    await entry({ type: "TOPUP", status: "FAILED", amount: 200, currency: "EUR", method: "CARD", provider: "PINGPONG", description: "Nạp EUR bằng thẻ", hoursAgo: 200, failReason: "Thẻ bị từ chối." });
    await entry({ type: "TOPUP", status: "COMPLETED", amount: 300, currency: "EUR", method: "CARD", provider: "PINGPONG", description: "Nạp EUR bằng thẻ", hoursAgo: 199 });
    await entry({ type: "TOPUP", status: "COMPLETED", amount: 150, currency: "GBP", method: "BANK_TRANSFER", provider: "WORLDFIRST", description: "Nạp GBP qua chuyển khoản nội địa", hoursAgo: 120 });

    // 1 đơn đã trả bằng ví
    const tote = await prisma.product.findUnique({ where: { slug: "canvas-tote" }, include: { prices: { where: { currency: "USD" } } } });
    const watch = await prisma.product.findUnique({ where: { slug: "field-watch" }, include: { prices: { where: { currency: "USD" } } } });
    if (tote && watch) {
      const a = Number(tote.prices[0].amount), b = Number(watch.prices[0].amount);
      const total = Math.round((a + b) * 100) / 100;
      const order = await prisma.order.create({
        data: {
          number: "OP-SEED-0001",
          userId: user.id,
          email: u.email,
          customerName: u.name,
          country: "United States",
          address: "1 Demo Street, NY",
          currency: "USD",
          subtotal: total,
          shipping: 0,
          total,
          status: "PAID",
          paymentMethod: "STORE_WALLET",
          paidAt: ago(48),
          createdAt: ago(48),
          items: {
            create: [
              { productId: tote.id, name: tote.name, quantity: 1, unitPrice: a, lineTotal: a },
              { productId: watch.id, name: watch.name, quantity: 1, unitPrice: b, lineTotal: b },
            ],
          },
          events: { create: [{ type: "order.created", message: "Tạo đơn OP-SEED-0001", createdAt: ago(48) }, { type: "wallet.debited", message: `Trừ ví USD: ${total}`, createdAt: ago(48) }] },
        },
      });
      await entry({ type: "PAYMENT", status: "COMPLETED", amount: total, currency: "USD", method: "STORE_WALLET", description: `Thanh toán đơn ${order.number}`, hoursAgo: 48, orderId: order.id });
    }

    for (const [currency, bal] of Object.entries(balances)) {
      await prisma.wallet.update({ where: { id: wallets[currency] }, data: { balance: bal } });
    }
  }
}

main().finally(() => prisma.$disconnect());
