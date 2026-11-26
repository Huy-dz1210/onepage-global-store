"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, getCurrentUser, hashPassword, isAdmin, verifyPassword } from "@/lib/auth";
import { analyze, commitImport, type ImportOptions } from "@/lib/import/commit";
import { FIELDS, type Mapping } from "@/lib/import/normalize";
import { cancelTopup, type ConfirmPayload, confirmTopup, createTopup, type CreateTopupInput } from "@/lib/wallet";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { isShopCurrency } from "@/lib/currency";
import { checkout, type CheckoutInput, simulateInboundTransfer, simulateTopupTransfer } from "@/lib/orders";
import { externalIdFromCreds } from "@/lib/providers";
import { PROVIDER_META } from "@/lib/providers/meta";
import { syncAccount, syncAll } from "@/lib/sync";

export async function setCurrency(code: string) {
  if (!isShopCurrency(code)) return;
  (await cookies()).set("currency", code, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function placeOrder(input: Omit<CheckoutInput, "userId">) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Bạn cần đăng nhập để thanh toán" };
  const r = await checkout({ ...input, userId: user.id });
  revalidatePath("/account", "layout");
  return r;
}

export async function simulateTransfer(orderId: string, partial = false) {
  const user = await getCurrentUser();
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!user || (order.userId !== user.id && user.role !== "ADMIN")) throw new Error("Không có quyền");
  await simulateInboundTransfer(orderId, partial ? Math.round(Number(order.total) * 0.5 * 100) / 100 : undefined);
  revalidatePath(`/orders/${orderId}`);
}

async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Chỉ admin");
}

export async function syncNow(accountId?: string) {
  await assertAdmin();
  if (accountId) await syncAccount(accountId, "manual").catch(() => null);
  else await syncAll("manual");
  revalidatePath("/admin", "layout");
}

export async function toggleAccount(accountId: string, enabled: boolean) {
  await assertAdmin();
  await prisma.account.update({ where: { id: accountId }, data: { enabled } });
  revalidatePath("/admin/accounts");
}

export async function addAccount(formData: FormData) {
  await assertAdmin();
  const provider = String(formData.get("provider")) as keyof typeof PROVIDER_META;
  const meta = PROVIDER_META[provider];
  if (!meta) throw new Error("Provider không hợp lệ");
  const creds: Record<string, string> = {};
  for (const f of meta.fields) creds[f.key] = String(formData.get(f.key) ?? "").trim();
  const importOnly = formData.get("importOnly") === "on";
  const baseUrl = importOnly ? "import://" : String(formData.get("baseUrl") || `${process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://127.0.0.1:3000")}${meta.mockPath}`);
  const account = await prisma.account.create({
    data: {
      provider,
      name: String(formData.get("name") || meta.label),
      baseUrl,
      credentials: encryptJson(creds),
      enabled: !importOnly,
      externalAccountId: importOnly ? null : externalIdFromCreds(provider, creds) || null,
    },
  });
  if (!importOnly) await syncAccount(account.id, "manual").catch(() => null);
  revalidatePath("/admin", "layout");
}

// ───────────── Auth ─────────────

export type AuthState = { error?: string } | undefined;

function safeNext(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/account";
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "Email hoặc mật khẩu không đúng" };
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function register(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email không hợp lệ" };
  if (name.length < 2) return { error: "Nhập họ tên" };
  if (password.length < 6) return { error: "Mật khẩu tối thiểu 6 ký tự" };
  if (await prisma.user.findUnique({ where: { email } })) return { error: "Email đã được đăng ký" };
  const user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(password) } });
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// ───────────── Ví ─────────────

export async function startTopup(input: CreateTopupInput) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Bạn cần đăng nhập" };
  return createTopup(user.id, input);
}

export async function confirmTopupPayment(txId: string, payload: ConfirmPayload) {
  const user = await getCurrentUser();
  if (!user) return { status: "ERROR" as const, error: "Bạn cần đăng nhập" };
  // độ trễ xử lý như cổng thật
  await new Promise((r) => setTimeout(r, 900));
  const r = await confirmTopup(user, txId, payload);
  revalidatePath("/account", "layout");
  revalidatePath(`/pay/${txId}`);
  return r;
}

export async function cancelTopupPayment(txId: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await cancelTopup(txId, user.id);
  revalidatePath(`/pay/${txId}`);
}

export async function simulateTopup(walletTxId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Chưa đăng nhập");
  await simulateTopupTransfer(walletTxId, user.id);
  revalidatePath(`/account/wallet/${walletTxId}`);
  revalidatePath(`/pay/${walletTxId}`);
}

// ───────────── Import sao kê ─────────────

function importOpts(fd: FormData): ImportOptions {
  const m = fd.get("mapping");
  return {
    accountId: String(fd.get("accountId")),
    mapping: m ? (JSON.parse(String(m)) as Mapping) : undefined,
    defaultCurrency: String(fd.get("defaultCurrency") || "USD"),
    dateFormat: (String(fd.get("dateFormat") || "auto") as ImportOptions["dateFormat"]),
  };
}

async function fileOf(fd: FormData) {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) throw new Error("Chọn file sao kê");
  if (f.size > 20 * 1024 * 1024) throw new Error("File tối đa 20MB");
  return { buf: Buffer.from(await f.arrayBuffer()), name: f.name };
}

export async function previewImport(fd: FormData) {
  await assertAdmin();
  try {
    const { buf, name } = await fileOf(fd);
    const a = await analyze(buf, name, importOpts(fd));
    const ok = a.results.filter((r) => r.ok);
    return {
      ok: true as const,
      headers: a.sheet.headers,
      sample: a.sheet.rows.slice(0, 5),
      mapping: a.mapping,
      dateFormat: a.dateFormat,
      guessedProvider: a.guessedProvider,
      accountProvider: a.account.provider,
      fields: FIELDS,
      total: a.results.length,
      valid: ok.length,
      errors: a.results.map((r, i) => (r.ok ? null : { row: i + 1, error: r.error! })).filter(Boolean).slice(0, 10),
      preview: ok.slice(0, 15).map((r) => ({ ...r.tx!, occurredAt: r.tx!.occurredAt.toISOString(), raw: undefined })),
      currencies: [...new Set(ok.map((r) => r.tx!.currency))],
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runImport(fd: FormData) {
  await assertAdmin();
  const user = await getCurrentUser();
  try {
    const { buf, name } = await fileOf(fd);
    const r = await commitImport(buf, name, importOpts(fd), user?.email);
    revalidatePath("/admin", "layout");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
