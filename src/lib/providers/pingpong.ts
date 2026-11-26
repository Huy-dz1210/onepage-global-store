import type { TxStatus, TxType } from "@/generated/prisma/enums";
import { requestJson, windows } from "./http";
import { type CheckoutRequest, type NormalizedTx, type ProviderAdapter, ProviderError } from "./types";

type Creds = { appId: string; appSecret: string };

const TYPE: Record<string, TxType> = {
  INBOUND_COLLECTION: "COLLECTION",
  ACQUIRING_CAPTURE: "COLLECTION",
  PINGPONG_PAY: "COLLECTION",
  INBOUND_TRANSFER: "TRANSFER_IN",
  WITHDRAW: "WITHDRAWAL",
  OUTBOUND_PAYMENT: "PAYMENT",
  CARD_CONSUME: "CARD",
  FX_EXCHANGE: "FX",
  SERVICE_FEE: "FEE",
  REFUND: "REFUND",
};
const STATUS: Record<string, TxStatus> = { SUCCESS: "COMPLETED", PROCESSING: "PENDING", FAILED: "FAILED" };

interface PPTx {
  trans_id: string;
  trans_type: string;
  fund_direction: "CREDIT" | "DEBIT";
  biz_status: string;
  currency: string;
  amount: string;
  fee_amount: string;
  fee_currency: string;
  target_currency: string | null;
  target_amount: string | null;
  rate: string | null;
  counterparty_name: string;
  remark: string;
  out_trade_no: string;
  create_time: number;
}

export function pingpongAdapter(baseUrl: string, creds: Creds): ProviderAdapter {
  let token: { value: string; exp: number } | null = null;

  async function auth() {
    if (token && token.exp > Date.now() + 60000) return token.value;
    const { body } = await requestJson<{ code: string; msg: string; data: { access_token: string; expires_in: number } }>(
      `${baseUrl}/v1/oauth/token`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }) },
    );
    if (body.code !== "0000") throw new ProviderError(`PingPong auth: ${body.msg}`);
    token = { value: body.data.access_token, exp: Date.now() + body.data.expires_in * 1000 };
    return token.value;
  }

  const get = async <T>(path: string) => {
    const { body } = await requestJson<{ code: string; msg: string; data: T }>(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${await auth()}` },
    });
    if (body.code !== "0000") throw new ProviderError(`PingPong: ${body.msg}`);
    return body.data;
  };

  function normalize(t: PPTx): NormalizedTx {
    return {
      externalId: t.trans_id,
      direction: t.fund_direction === "CREDIT" ? "IN" : "OUT",
      type: TYPE[t.trans_type] ?? "OTHER",
      status: STATUS[t.biz_status] ?? "PENDING",
      amount: Number(t.amount),
      currency: t.currency,
      fee: Number(t.fee_amount),
      feeCurrency: t.fee_currency,
      counterAmount: t.target_amount ? Number(t.target_amount) : undefined,
      counterCurrency: t.target_currency ?? undefined,
      fxRate: t.rate ? Number(t.rate) : undefined,
      counterparty: t.counterparty_name,
      description: t.remark,
      reference: t.out_trade_no,
      occurredAt: new Date(t.create_time),
      raw: t,
    };
  }

  return {
    provider: "PINGPONG",
    async fetchBalances() {
      const d = await get<{ balances: { currency: string; available_amount: string; pending_amount: string }[] }>("/v2/accounts/balances");
      return d.balances.map((b) => ({ currency: b.currency, available: Number(b.available_amount), pending: Number(b.pending_amount) }));
    },
    async *fetchTransactions(from, to) {
      for (const [s, e] of windows(from, to, 90)) {
        for (let page = 1; ; page++) {
          const d = await get<{ total: number; list: PPTx[] }>(
            `/v2/transactions?start_time=${s.getTime()}&end_time=${e.getTime()}&page_no=${page}&page_size=100`,
          );
          if (d.list.length) yield d.list.map(normalize);
          if (page * 100 >= d.total) break;
        }
      }
    },
    async checkout(req: CheckoutRequest) {
      const { body } = await requestJson<{ code: string; msg: string; data: { trans_id: string; fee_amount?: string; fail_reason?: string } | null }>(
        `${baseUrl}/v4/checkout/payments`,
        {
          method: "POST",
          retries: 0,
          allowStatus: [402],
          headers: { "content-type": "application/json", authorization: `Bearer ${await auth()}` },
          body: JSON.stringify(req),
        },
      );
      return body.code === "0000"
        ? { ok: true, externalId: body.data!.trans_id, fee: Number(body.data!.fee_amount ?? 0), raw: body }
        : { ok: false, externalId: body.data?.trans_id, error: body.data?.fail_reason ?? body.msg, raw: body };
    },
  };
}
