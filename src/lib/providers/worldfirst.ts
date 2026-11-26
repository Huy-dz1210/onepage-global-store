import type { TxStatus, TxType } from "@/generated/prisma/enums";
import { decimalsOf } from "@/lib/fx";
import { signRequest } from "@/lib/mock/auth";
import { requestJson, windows } from "./http";
import { type NormalizedTx, type ProviderAdapter, ProviderError } from "./types";

type Creds = { clientId: string; clientSecret: string };
type Money = { currency: string; value: string };

const fromMinor = (m: Money) => Number(m.value) / 10 ** decimalsOf(m.currency);

const TYPE: Record<string, TxType> = {
  COLLECTION: "COLLECTION",
  ACQUIRING: "COLLECTION",
  WF_PAY: "COLLECTION",
  LOCAL_INBOUND: "TRANSFER_IN",
  TRANSFER_IN: "TRANSFER_IN",
  WITHDRAW: "WITHDRAWAL",
  PAYMENT: "PAYMENT",
  CARD: "CARD",
  EXCHANGE: "FX",
  FEE: "FEE",
  REFUND: "REFUND",
};
const STATUS: Record<string, TxStatus> = { SUCCESS: "COMPLETED", PROCESSING: "PENDING", FAIL: "FAILED" };

interface WFTx {
  transactionId: string;
  transactionType: string;
  fundDirection: "IN" | "OUT";
  transactionStatus: string;
  transactionAmount: Money;
  feeAmount: Money;
  exchangeTargetAmount?: Money;
  exchangeRate?: string;
  counterPartyName: string;
  remark: string;
  referenceNo: string;
  transactionTime: string;
}

type WFResult = { result: { resultStatus: "S" | "F" | "U"; resultCode: string; resultMessage: string } };

export function worldfirstAdapter(baseUrl: string, creds: Creds): ProviderAdapter {
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, "");

  async function call<T>(path: string, payload: unknown, allowStatus: number[] = []) {
    const body = JSON.stringify(payload);
    const requestTime = new Date().toISOString();
    const signature = signRequest(creds.clientSecret, "POST", basePath + path, creds.clientId, requestTime, body);
    const res = await requestJson<WFResult & T>(`${baseUrl}${path}`, {
      method: "POST",
      allowStatus,
      retries: allowStatus.length ? 0 : 3,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "client-id": creds.clientId,
        "request-time": requestTime,
        signature: `algorithm=HMAC-SHA256,keyVersion=1,signature=${signature}`,
      },
      body,
    });
    if (res.body.result.resultStatus !== "S" && !allowStatus.includes(res.status))
      throw new ProviderError(`WorldFirst: ${res.body.result.resultCode}`);
    return res.body;
  }

  function normalize(t: WFTx): NormalizedTx {
    return {
      externalId: t.transactionId,
      direction: t.fundDirection,
      type: TYPE[t.transactionType] ?? "OTHER",
      status: STATUS[t.transactionStatus] ?? "PENDING",
      amount: fromMinor(t.transactionAmount),
      currency: t.transactionAmount.currency,
      fee: fromMinor(t.feeAmount),
      feeCurrency: t.feeAmount.currency,
      counterAmount: t.exchangeTargetAmount ? fromMinor(t.exchangeTargetAmount) : undefined,
      counterCurrency: t.exchangeTargetAmount?.currency,
      fxRate: t.exchangeRate ? Number(t.exchangeRate) : undefined,
      counterparty: t.counterPartyName,
      description: t.remark,
      reference: t.referenceNo,
      occurredAt: new Date(t.transactionTime),
      raw: t,
    };
  }

  return {
    provider: "WORLDFIRST",
    async fetchBalances() {
      const d = await call<{ accountBalances: { currency: string; availableBalance: Money; pendingBalance: Money }[] }>(
        "/amsin/api/v1/business/account/inquiryBalance",
        {},
      );
      return d.accountBalances.map((b) => ({ currency: b.currency, available: fromMinor(b.availableBalance), pending: fromMinor(b.pendingBalance) }));
    },
    async *fetchTransactions(from, to) {
      for (const [s, e] of windows(from, to, 30)) {
        for (let page = 1; ; page++) {
          const d = await call<{ totalPageNumber: number; transactions: WFTx[] }>(
            "/amsin/api/v1/business/account/inquiryTransactions",
            { startTime: s.toISOString(), endTime: e.toISOString(), pageNumber: page, pageSize: 100 },
          );
          if (d.transactions.length) yield d.transactions.map(normalize);
          if (page >= d.totalPageNumber) break;
        }
      }
    },
    async checkout(req) {
      const d = await call<{ paymentId?: string }>("/amsin/api/v1/payments/pay", req, [402]);
      return d.result.resultStatus === "S"
        ? { ok: true, externalId: d.paymentId, raw: d }
        : { ok: false, externalId: d.paymentId, error: d.result.resultCode, raw: d };
    },
  };
}
