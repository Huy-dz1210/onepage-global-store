import type { TxStatus, TxType } from "@/generated/prisma/enums";
import { requestJson, windows } from "./http";
import type { NormalizedTx, ProviderAdapter } from "./types";

type Creds = { clientId: string; clientSecret: string; programId: string; payeeId: string };

const TYPE: Record<string, TxType> = {
  "Payment received": "COLLECTION",
  "Card payment received": "COLLECTION",
  "Payoneer checkout": "COLLECTION",
  "Incoming transfer": "TRANSFER_IN",
  "Withdrawal to bank": "WITHDRAWAL",
  "Payment made": "PAYMENT",
  "Card charge": "CARD",
  "Currency conversion": "FX",
  Fee: "FEE",
  Refund: "REFUND",
};
const STATUS: Record<string, TxStatus> = { Completed: "COMPLETED", Pending: "PENDING", Failed: "FAILED", Cancelled: "CANCELLED" };

interface PYTx {
  transaction_id: string;
  type: string;
  status: string;
  direction: "credit" | "debit";
  amount: { value: number; currency: string };
  fee: { value: number; currency: string };
  converted_amount: { value: number; currency: string } | null;
  exchange_rate: number | null;
  counterparty: { name: string };
  description: string;
  reference_id: string;
  created_at: string;
}

export function payoneerAdapter(baseUrl: string, creds: Creds): ProviderAdapter {
  let token: { value: string; exp: number } | null = null;
  const payeePath = `/v4/programs/${creds.programId}/payees/${creds.payeeId}`;

  async function auth() {
    if (token && token.exp > Date.now() + 60000) return token.value;
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
    const { body } = await requestJson<{ access_token: string; expires_in: number }>(`${baseUrl}/v2/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=read%20write",
    });
    token = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  const headers = async () => ({ authorization: `Bearer ${await auth()}`, "content-type": "application/json" });

  function normalize(t: PYTx): NormalizedTx {
    return {
      externalId: t.transaction_id,
      direction: t.direction === "credit" ? "IN" : "OUT",
      type: TYPE[t.type] ?? "OTHER",
      status: STATUS[t.status] ?? "PENDING",
      amount: t.amount.value,
      currency: t.amount.currency,
      fee: t.fee?.value ?? 0,
      feeCurrency: t.fee?.currency,
      counterAmount: t.converted_amount?.value,
      counterCurrency: t.converted_amount?.currency,
      fxRate: t.exchange_rate ?? undefined,
      counterparty: t.counterparty?.name,
      description: t.description,
      reference: t.reference_id,
      occurredAt: new Date(t.created_at),
      raw: t,
    };
  }

  return {
    provider: "PAYONEER",
    async fetchBalances() {
      const { body } = await requestJson<{ result: { balances: { items: { currency: string; available_balance: number; pending_balance: number }[] } } }>(
        `${baseUrl}${payeePath}/balances`,
        { headers: await headers() },
      );
      return body.result.balances.items.map((b) => ({ currency: b.currency, available: b.available_balance, pending: b.pending_balance }));
    },
    async *fetchTransactions(from, to) {
      for (const [s, e] of windows(from, to, 31)) {
        for (let page = 1; ; page++) {
          const qs = new URLSearchParams({ from: s.toISOString(), to: e.toISOString(), page: String(page), page_size: "100" });
          const { body } = await requestJson<{ result: { has_more: boolean; transactions: PYTx[] } }>(
            `${baseUrl}${payeePath}/transactions?${qs}`,
            { headers: await headers() },
          );
          if (body.result.transactions.length) yield body.result.transactions.map(normalize);
          if (!body.result.has_more) break;
        }
      }
    },
    async checkout(req) {
      const { body } = await requestJson<{ result: { status: string; transaction_id: string | null; fee?: number; reason?: string } }>(
        `${baseUrl}${payeePath}/checkout`,
        { method: "POST", retries: 0, allowStatus: [402], headers: await headers(), body: JSON.stringify(req) },
      );
      return body.result.status === "Completed"
        ? { ok: true, externalId: body.result.transaction_id!, fee: body.result.fee, raw: body }
        : { ok: false, externalId: body.result.transaction_id ?? undefined, error: body.result.reason, raw: body };
    },
  };
}
