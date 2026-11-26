import "server-only";
import { prisma } from "@/lib/db";
import { toUsd } from "@/lib/fx";
import { upsertPage } from "@/lib/sync";
import type { NormalizedTx } from "@/lib/providers/types";
import { autoMap, type DateFormat, detectDateFormat, guessProvider, type Mapping, normalizeRow } from "./normalize";
import { parseStatement } from "./parse";

export interface ImportOptions {
  accountId: string;
  mapping?: Mapping;
  defaultCurrency: string;
  dateFormat: DateFormat;
}

export async function analyze(buf: Buffer, fileName: string, opts: ImportOptions) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: opts.accountId } });
  const sheet = await parseStatement(buf, fileName);
  const mapping = opts.mapping ?? autoMap(sheet.headers);
  const dateFormat =
    opts.dateFormat === "auto" && mapping.date !== undefined ? detectDateFormat(sheet.rows.map((r) => r[mapping.date!] ?? "")) : opts.dateFormat;
  const results = sheet.rows.map((r) =>
    normalizeRow(r, sheet.headers, mapping, { accountKey: account.id, defaultCurrency: opts.defaultCurrency, dateFormat }),
  );
  return { account, sheet, mapping, dateFormat, results, guessedProvider: guessProvider(sheet.headers, fileName) };
}

export async function commitImport(buf: Buffer, fileName: string, opts: ImportOptions, userEmail?: string) {
  const { account, sheet, mapping, results } = await analyze(buf, fileName, opts);
  const txs = results.filter((r) => r.ok).map((r) => r.tx!) as NormalizedTx[];

  const batch = await prisma.importBatch.create({
    data: {
      accountId: account.id,
      fileName,
      totalRows: sheet.rows.length,
      inserted: 0,
      updated: 0,
      skipped: sheet.rows.length - txs.length,
      mapping: { ...mapping, defaultCurrency: opts.defaultCurrency, dateFormat: opts.dateFormat },
      createdBy: userEmail,
    },
  });

  let inserted = 0, updated = 0;
  for (let i = 0; i < txs.length; i += 500) {
    const r = await upsertPage(account.id, account.provider, txs.slice(i, i + 500), { source: "import", importBatchId: batch.id });
    inserted += r.inserted;
    updated += r.updated;
  }

  // Cập nhật số dư nếu file có cột "số dư" (lấy dòng mới nhất mỗi currency)
  const latest = new Map<string, { value: number; at: Date }>();
  for (const r of results) {
    if (!r.balance) continue;
    const cur = latest.get(r.balance.currency);
    if (!cur || r.balance.at >= cur.at) latest.set(r.balance.currency, r.balance);
  }
  for (const [currency, b] of latest) {
    await prisma.balance.upsert({
      where: { accountId_currency: { accountId: account.id, currency } },
      create: { accountId: account.id, currency, available: b.value, availableUsd: toUsd(b.value, currency) },
      update: { available: b.value, availableUsd: toUsd(b.value, currency) },
    });
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { inserted, updated } });
  await prisma.account.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } });
  return { batchId: batch.id, total: sheet.rows.length, inserted, updated, skipped: sheet.rows.length - txs.length, balances: latest.size };
}
