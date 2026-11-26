import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { txWhere } from "@/lib/tx-filters";

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await prisma.transaction.findMany({
    where: txWhere(sp),
    orderBy: { occurredAt: "desc" },
    take: 50000,
    include: { account: { select: { name: true } } },
  });
  const head = ["occurred_at", "provider", "account", "external_id", "direction", "type", "status", "amount", "currency", "fee", "counter_amount", "counter_currency", "fx_rate", "amount_usd", "counterparty", "description", "reference"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.occurredAt.toISOString(), r.provider, r.account.name, r.externalId, r.direction, r.type, r.status, r.amount, r.currency, r.fee, r.counterAmount, r.counterCurrency, r.fxRate, r.amountUsd, r.counterparty, r.description, r.reference].map(esc).join(","),
  );
  return new Response([head.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
