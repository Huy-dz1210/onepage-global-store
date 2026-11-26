/**
 * Sync engine: kéo balances + transactions từ provider → chuẩn hóa → upsert Postgres.
 *  - Lần đầu: kéo INITIAL_DAYS ngày.
 *  - Các lần sau: incremental từ syncCursor - LOOKBACK (để bắt các giao dịch đổi trạng thái pending → completed).
 *  - Idempotent nhờ unique(accountId, externalId).
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { toUsd } from "@/lib/fx";
import { adapterFor } from "@/lib/providers";
import type { NormalizedTx } from "@/lib/providers/types";

const INITIAL_DAYS = Number(process.env.SYNC_INITIAL_DAYS ?? 90);
const LOOKBACK_HOURS = Number(process.env.SYNC_LOOKBACK_HOURS ?? 72);

const running = new Set<string>();

export type SyncTrigger = "schedule" | "manual" | "cli" | "webhook";

export async function syncAccount(accountId: string, trigger: SyncTrigger) {
  if (running.has(accountId)) return { skipped: true as const };
  running.add(accountId);

  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (account.baseUrl.startsWith("import://")) {
    running.delete(accountId);
    return { skipped: true as const };
  }
  const run = await prisma.syncRun.create({ data: { accountId, trigger } });
  const stats = { fetched: 0, inserted: 0, updated: 0 };

  try {
    const adapter = adapterFor(account);
    const now = new Date();

    // 1) balances
    const balances = await adapter.fetchBalances();
    for (const b of balances) {
      await prisma.balance.upsert({
        where: { accountId_currency: { accountId, currency: b.currency } },
        create: { accountId, currency: b.currency, available: b.available, pending: b.pending, availableUsd: toUsd(b.available, b.currency) },
        update: { available: b.available, pending: b.pending, availableUsd: toUsd(b.available, b.currency) },
      });
    }

    // 2) transactions
    const from = account.syncCursor
      ? new Date(account.syncCursor.getTime() - LOOKBACK_HOURS * 3600000)
      : new Date(now.getTime() - INITIAL_DAYS * 86400000);

    for await (const page of adapter.fetchTransactions(from, now)) {
      stats.fetched += page.length;
      const r = await upsertPage(account.id, account.provider, page);
      stats.inserted += r.inserted;
      stats.updated += r.updated;
    }

    await prisma.account.update({
      where: { id: accountId },
      data: { syncCursor: now, lastSyncedAt: now, lastError: null },
    });
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), ...stats },
    });
    return { skipped: false as const, ...stats };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.account.update({ where: { id: accountId }, data: { lastError: msg } });
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: msg, ...stats },
    });
    throw e;
  } finally {
    running.delete(accountId);
  }
}

export async function upsertPage(
  accountId: string,
  provider: Prisma.TransactionCreateManyInput["provider"],
  page: NormalizedTx[],
  extra: { source?: string; importBatchId?: string } = {},
) {
  const existing = await prisma.transaction.findMany({
    where: { accountId, externalId: { in: page.map((t) => t.externalId) } },
    select: { id: true, externalId: true, status: true, amount: true },
  });
  const byId = new Map(existing.map((e) => [e.externalId, e]));

  const toCreate: Prisma.TransactionCreateManyInput[] = [];
  const toUpdate: { id: string; t: NormalizedTx }[] = [];

  for (const t of page) {
    const ex = byId.get(t.externalId);
    if (!ex) {
      toCreate.push({
        accountId,
        provider,
        externalId: t.externalId,
        direction: t.direction,
        type: t.type,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        fee: t.fee,
        feeCurrency: t.feeCurrency,
        counterAmount: t.counterAmount,
        counterCurrency: t.counterCurrency,
        fxRate: t.fxRate,
        amountUsd: toUsd(t.amount, t.currency),
        counterparty: t.counterparty,
        description: t.description,
        reference: t.reference,
        occurredAt: t.occurredAt,
        raw: t.raw as Prisma.InputJsonValue,
        source: extra.source ?? "api",
        importBatchId: extra.importBatchId,
      });
    } else if (ex.status !== t.status || Number(ex.amount) !== t.amount) {
      toUpdate.push({ id: ex.id, t });
    }
  }

  if (toCreate.length) await prisma.transaction.createMany({ data: toCreate, skipDuplicates: true });
  for (const { id, t } of toUpdate) {
    await prisma.transaction.update({
      where: { id },
      data: { status: t.status, amount: t.amount, fee: t.fee, amountUsd: toUsd(t.amount, t.currency), raw: t.raw as Prisma.InputJsonValue },
    });
  }
  return { inserted: toCreate.length, updated: toUpdate.length };
}

export async function syncAll(trigger: SyncTrigger) {
  const accounts = await prisma.account.findMany({ where: { enabled: true }, select: { id: true, name: true } });
  const results = await Promise.allSettled(accounts.map((a) => syncAccount(a.id, trigger)));
  return accounts.map((a, i) => ({
    account: a.name,
    ...(results[i].status === "fulfilled" ? { ok: true, ...results[i].value } : { ok: false, error: String((results[i] as PromiseRejectedResult).reason) }),
  }));
}
