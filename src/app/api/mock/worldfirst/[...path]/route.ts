/**
 * Mock WorldFirst API (format mô phỏng, KHÔNG phải spec chính thức).
 * Mọi request ký HMAC-SHA256: headers Client-Id, Request-Time (ISO), Signature: algorithm=HMAC-SHA256,signature=...
 * Số tiền trả về theo đơn vị nhỏ nhất (minor units) dạng string.
 *  POST /amsin/api/v1/business/account/inquiryBalance
 *  POST /amsin/api/v1/business/account/inquiryTransactions {startTime, endTime, pageNumber, pageSize}
 *  POST /amsin/api/v1/payments/pay                         (card / wallet checkout)
 *  POST /sandbox/simulate-inbound                          (sandbox: giả lập khách chuyển khoản local)
 */
import { MOCK_MERCHANTS } from "@/lib/mock/accounts";
import { verifySignedRequest } from "@/lib/mock/auth";
import { recordPayment } from "@/lib/mock/gateway";
import { type CheckoutBody, type Ctx, json, paginate, runCheckout } from "@/lib/mock/http";
import { getBalances, getLedger, type MockTx, shouldFail } from "@/lib/mock/ledger";
import { decimalsOf } from "@/lib/fx";

const minor = (v: number, c: string) => Math.round(v * 10 ** decimalsOf(c)).toString();
const money = (v: number, c: string) => ({ currency: c, value: minor(v, c) });

const TYPE: Record<string, string> = {
  COLLECTION: "COLLECTION",
  TRANSFER_IN: "TRANSFER_IN",
  WITHDRAWAL: "WITHDRAW",
  PAYMENT: "PAYMENT",
  CARD: "CARD",
  FX: "EXCHANGE",
  FEE: "FEE",
  REFUND: "REFUND",
};
const STATUS = { PENDING: "PROCESSING", COMPLETED: "SUCCESS", FAILED: "FAIL" };

function toWfTime(d: Date) {
  // WorldFirst trả giờ +08:00
  const t = new Date(d.getTime() + 8 * 3600000).toISOString().replace("Z", "+08:00");
  return t.replace(/\.\d{3}/, "");
}

function format(t: MockTx) {
  return {
    transactionId: t.id,
    transactionType:
      t.channel === "BANK_INBOUND" ? "LOCAL_INBOUND" : t.channel === "CARD_ACQUIRING" ? "ACQUIRING" : t.channel === "WALLET_PAY" ? "WF_PAY" : TYPE[t.kind],
    fundDirection: t.direction,
    transactionStatus: STATUS[t.status],
    transactionAmount: money(t.amount, t.currency),
    feeAmount: money(t.fee, t.currency),
    exchangeTargetAmount: t.counterAmount && t.counterCurrency ? money(t.counterAmount, t.counterCurrency) : undefined,
    exchangeRate: t.rate?.toString(),
    counterPartyName: t.counterparty,
    remark: t.description,
    referenceNo: t.reference,
    transactionTime: toWfTime(t.time),
  };
}

const result = (status: "S" | "F", code = "SUCCESS", message = "success") => ({
  result: { resultStatus: status, resultCode: code, resultMessage: message },
});

export async function POST(req: Request, { params }: Ctx) {
  const pathArr = (await params).path;
  const path = "/" + pathArr.join("/");
  if (shouldFail()) return json(result("F", "SYSTEM_BUSY", "System busy"), 503);

  // Sandbox tool: giả lập tiền về tài khoản local (không cần ký)
  if (path === "/sandbox/simulate-inbound") {
    const b = await req.json();
    const m = MOCK_MERCHANTS.find((x) => x.provider === "WORLDFIRST" && x.key === b.merchantKey) ?? MOCK_MERCHANTS.find((x) => x.provider === "WORLDFIRST")!;
    const p = await recordPayment({
      provider: "WORLDFIRST",
      merchantKey: m.key,
      kind: "BANK_INBOUND",
      amount: Number(b.amount),
      currency: b.currency,
      status: "COMPLETED",
      payerName: b.payerName ?? "Unknown payer",
      reference: b.reference,
      description: `Local ${b.currency} transfer – ref ${b.reference}`,
      meta: { rail: b.rail },
    });
    return json({ ...result("S"), transactionId: p.externalId });
  }

  const { merchant: m, body } = await verifySignedRequest(req, "/api/mock/worldfirst" + path);
  if (!m) return json(result("F", "INVALID_SIGNATURE", "Signature verification failed"), 401);
  const b = body ? JSON.parse(body) : {};

  if (path === "/amsin/api/v1/business/account/inquiryBalance") {
    const bal = await getBalances(m);
    return json({
      ...result("S"),
      accountBalances: bal.map((x) => ({
        accountNo: `WF${m.key.slice(-5)}${x.currency}`,
        currency: x.currency,
        availableBalance: money(x.available, x.currency),
        pendingBalance: money(x.pending, x.currency),
        frozenBalance: money(0, x.currency),
      })),
    });
  }

  if (path === "/amsin/api/v1/business/account/inquiryTransactions") {
    const end = b.endTime ? new Date(b.endTime) : new Date();
    const start = b.startTime ? new Date(b.startTime) : new Date(end.getTime() - 7 * 86400000);
    const all = await getLedger(m, start, end);
    const p = paginate(all, Number(b.pageNumber), Number(b.pageSize ?? 50));
    return json({
      ...result("S"),
      totalCount: p.total,
      pageNumber: p.page,
      totalPageNumber: Math.ceil(p.total / p.size),
      transactions: p.items.map(format),
    });
  }

  if (path === "/amsin/api/v1/payments/pay") {
    const r = await runCheckout(m, b as CheckoutBody);
    if (!r.ok) return json({ ...result("F", r.code, r.message), paymentId: r.payment?.externalId }, 402);
    return json({ ...result("S"), paymentId: r.payment.externalId, paymentStatus: "SUCCESS" });
  }

  return json(result("F", "NOT_FOUND", "Not found"), 404);
}
