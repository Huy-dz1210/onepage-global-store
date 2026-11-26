import type { Prisma } from "@/generated/prisma/client";

export type TxSearch = Partial<Record<"provider" | "account" | "currency" | "direction" | "status" | "type" | "q" | "from" | "to" | "page", string>>;

export function txWhere(sp: TxSearch): Prisma.TransactionWhereInput {
  const w: Prisma.TransactionWhereInput = {};
  if (sp.provider) w.provider = sp.provider as never;
  if (sp.account) w.accountId = sp.account;
  if (sp.currency) w.currency = sp.currency;
  if (sp.direction) w.direction = sp.direction as never;
  if (sp.status) w.status = sp.status as never;
  if (sp.type) w.type = sp.type as never;
  if (sp.from || sp.to) {
    w.occurredAt = {
      ...(sp.from ? { gte: new Date(sp.from) } : {}),
      ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (sp.q) {
    w.OR = [
      { externalId: { contains: sp.q, mode: "insensitive" } },
      { counterparty: { contains: sp.q, mode: "insensitive" } },
      { description: { contains: sp.q, mode: "insensitive" } },
      { reference: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  return w;
}
