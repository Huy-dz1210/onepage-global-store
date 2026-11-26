/**
 * Mock Payoneer API (format mô phỏng, KHÔNG phải spec chính thức).
 *  POST /v2/oauth2/token                                   Basic base64(client_id:client_secret), grant_type=client_credentials
 *  GET  /v4/programs/{programId}/payees/{payeeId}/balances
 *  GET  /v4/programs/{programId}/payees/{payeeId}/transactions?from=ISO&to=ISO&page=1&page_size=100
 *  POST /v4/programs/{programId}/payees/{payeeId}/checkout
 */
import { MOCK_MERCHANTS } from "@/lib/mock/accounts";
import { issueToken, verifyBearer } from "@/lib/mock/auth";
import { type CheckoutBody, type Ctx, json, paginate, runCheckout } from "@/lib/mock/http";
import { getBalances, getLedger, type MockTx, shouldFail } from "@/lib/mock/ledger";

const TYPE: Record<string, string> = {
  COLLECTION: "Payment received",
  TRANSFER_IN: "Incoming transfer",
  WITHDRAWAL: "Withdrawal to bank",
  PAYMENT: "Payment made",
  CARD: "Card charge",
  FX: "Currency conversion",
  FEE: "Fee",
  REFUND: "Refund",
};
const STATUS = { PENDING: "Pending", COMPLETED: "Completed", FAILED: "Failed" };

function format(t: MockTx) {
  return {
    transaction_id: t.id,
    type: t.channel === "CARD_ACQUIRING" ? "Card payment received" : t.channel === "WALLET_PAY" ? "Payoneer checkout" : TYPE[t.kind],
    status: STATUS[t.status],
    direction: t.direction === "IN" ? "credit" : "debit",
    amount: { value: t.amount, currency: t.currency },
    fee: { value: t.fee, currency: t.currency },
    converted_amount: t.counterAmount ? { value: t.counterAmount, currency: t.counterCurrency } : null,
    exchange_rate: t.rate ?? null,
    counterparty: { name: t.counterparty },
    description: t.description,
    reference_id: t.reference,
    created_at: t.time.toISOString(),
  };
}

const errBody = (code: number, description: string, status: number) =>
  json({ error: "request_failed", error_code: code, error_description: description }, status);

function merchantForPath(req: Request, path: string[]) {
  const m = verifyBearer(req, "PAYONEER");
  if (!m) return { m: null, res: errBody(401, "invalid_token", 401) };
  // v4/programs/{programId}/payees/{payeeId}/...
  if (path[2] !== m.credentials.programId || path[4] !== m.credentials.payeeId)
    return { m: null, res: errBody(403, "payee does not belong to this client", 403) };
  return { m, res: null };
}

export async function POST(req: Request, { params }: Ctx) {
  const path = (await params).path;
  if (shouldFail()) return errBody(503, "service_unavailable", 503);

  if (path.join("/") === "v2/oauth2/token") {
    const basic = (req.headers.get("authorization") ?? "").replace(/^Basic\s+/i, "");
    const [id, secret] = Buffer.from(basic, "base64").toString().split(":");
    const m = MOCK_MERCHANTS.find(
      (x) => x.provider === "PAYONEER" && x.credentials.clientId === id && x.credentials.clientSecret === secret,
    );
    if (!m) return json({ error: "invalid_client" }, 401);
    return json({ access_token: issueToken(m), token_type: "Bearer", expires_in: 3600, scope: "read write" });
  }

  if (path[0] === "v4" && path[5] === "checkout") {
    const { m, res } = merchantForPath(req, path);
    if (!m) return res;
    const r = await runCheckout(m, (await req.json()) as CheckoutBody);
    if (!r.ok) return json({ result: { status: "Failed", reason: r.code, transaction_id: r.payment?.externalId ?? null } }, 402);
    return json({ result: { status: "Completed", transaction_id: r.payment.externalId, fee: Number(r.payment.fee) } });
  }
  return errBody(404, "not_found", 404);
}

export async function GET(req: Request, { params }: Ctx) {
  const path = (await params).path;
  if (shouldFail()) return errBody(503, "service_unavailable", 503);
  if (path[0] !== "v4" || path[1] !== "programs") return errBody(404, "not_found", 404);
  const { m, res } = merchantForPath(req, path);
  if (!m) return res;
  const q = new URL(req.url).searchParams;

  if (path[5] === "balances") {
    const b = await getBalances(m);
    return json({
      result: {
        balances: {
          items: b.map((x) => ({
            id: `${m.key}-${x.currency}`,
            currency: x.currency,
            available_balance: x.available,
            pending_balance: x.pending,
            status: "Active",
          })),
        },
      },
    });
  }

  if (path[5] === "transactions") {
    const to = q.get("to") ? new Date(q.get("to")!) : new Date();
    const from = q.get("from") ? new Date(q.get("from")!) : new Date(to.getTime() - 30 * 86400000);
    const all = await getLedger(m, from, to);
    const p = paginate(all, Number(q.get("page")), Number(q.get("page_size") ?? 100));
    return json({
      result: {
        total: p.total,
        page: p.page,
        page_size: p.size,
        has_more: p.page * p.size < p.total,
        transactions: p.items.map(format),
      },
    });
  }
  return errBody(404, "not_found", 404);
}
