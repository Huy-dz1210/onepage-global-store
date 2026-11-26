/**
 * Mock PingPong API (format mô phỏng, KHÔNG phải spec chính thức).
 *  POST /v1/oauth/token            {app_id, app_secret}
 *  GET  /v2/accounts/balances
 *  GET  /v2/transactions?start_time=ms&end_time=ms&page_no=1&page_size=50
 *  POST /v4/checkout/payments      (card / wallet)
 */
import { MOCK_MERCHANTS } from "@/lib/mock/accounts";
import { issueToken, verifyBearer } from "@/lib/mock/auth";
import { type CheckoutBody, type Ctx, json, paginate, runCheckout } from "@/lib/mock/http";
import { getBalances, getLedger, type MockTx, shouldFail } from "@/lib/mock/ledger";

const TYPE: Record<string, string> = {
  COLLECTION: "INBOUND_COLLECTION",
  TRANSFER_IN: "INBOUND_TRANSFER",
  WITHDRAWAL: "WITHDRAW",
  PAYMENT: "OUTBOUND_PAYMENT",
  CARD: "CARD_CONSUME",
  FX: "FX_EXCHANGE",
  FEE: "SERVICE_FEE",
  REFUND: "REFUND",
};
const STATUS = { PENDING: "PROCESSING", COMPLETED: "SUCCESS", FAILED: "FAILED" };

function format(t: MockTx) {
  return {
    trans_id: t.id,
    trans_type: t.channel === "CARD_ACQUIRING" ? "ACQUIRING_CAPTURE" : t.channel === "WALLET_PAY" ? "PINGPONG_PAY" : TYPE[t.kind],
    fund_direction: t.direction === "IN" ? "CREDIT" : "DEBIT",
    biz_status: STATUS[t.status],
    currency: t.currency,
    amount: t.amount.toFixed(t.currency === "JPY" ? 0 : 2),
    fee_amount: t.fee.toFixed(t.currency === "JPY" ? 0 : 2),
    fee_currency: t.currency,
    target_currency: t.counterCurrency ?? null,
    target_amount: t.counterAmount?.toString() ?? null,
    rate: t.rate?.toString() ?? null,
    counterparty_name: t.counterparty,
    remark: t.description,
    out_trade_no: t.reference,
    create_time: t.time.getTime(),
  };
}

const ok = (data: unknown) => json({ code: "0000", msg: "success", data });
const err = (code: string, msg: string, status = 400) => json({ code, msg, data: null }, status);

export async function POST(req: Request, { params }: Ctx) {
  const path = (await params).path.join("/");
  if (shouldFail()) return err("9999", "Service temporarily unavailable", 503);

  if (path === "v1/oauth/token") {
    const { app_id, app_secret } = await req.json();
    const m = MOCK_MERCHANTS.find(
      (x) => x.provider === "PINGPONG" && x.credentials.appId === app_id && x.credentials.appSecret === app_secret,
    );
    if (!m) return err("1001", "Invalid app_id or app_secret", 401);
    return ok({ access_token: issueToken(m, 7200), token_type: "Bearer", expires_in: 7200 });
  }

  const m = verifyBearer(req, "PINGPONG");
  if (!m) return err("1002", "Invalid or expired access_token", 401);

  if (path === "v4/checkout/payments") {
    const r = await runCheckout(m, (await req.json()) as CheckoutBody);
    if (!r.ok) return json({ code: "3001", msg: r.message, data: { trans_id: r.payment?.externalId ?? null, biz_status: "FAILED", fail_reason: r.code } }, 402);
    return ok({ trans_id: r.payment.externalId, biz_status: "SUCCESS", fee_amount: r.payment.fee.toString() });
  }
  return err("404", "Not found", 404);
}

export async function GET(req: Request, { params }: Ctx) {
  const path = (await params).path.join("/");
  if (shouldFail()) return err("9999", "Service temporarily unavailable", 503);
  const m = verifyBearer(req, "PINGPONG");
  if (!m) return err("1002", "Invalid or expired access_token", 401);
  const q = new URL(req.url).searchParams;

  if (path === "v2/accounts/balances") {
    const b = await getBalances(m);
    return ok({
      balances: b.map((x) => ({
        currency: x.currency,
        available_amount: x.available.toString(),
        pending_amount: x.pending.toString(),
        frozen_amount: "0",
      })),
    });
  }

  if (path === "v2/transactions") {
    const end = Number(q.get("end_time") ?? Date.now());
    const start = Number(q.get("start_time") ?? end - 7 * 86400000);
    if (end - start > 92 * 86400000) return err("2001", "Time range must not exceed 92 days");
    const all = await getLedger(m, new Date(start), new Date(end));
    const p = paginate(all, Number(q.get("page_no")), Number(q.get("page_size")));
    return ok({ total: p.total, page_no: p.page, page_size: p.size, list: p.items.map(format) });
  }
  return err("404", "Not found", 404);
}
