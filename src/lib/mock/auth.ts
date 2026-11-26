import { createHmac, timingSafeEqual } from "node:crypto";
import type { Provider } from "@/generated/prisma/enums";
import { MOCK_MERCHANTS, type MockMerchant } from "./accounts";

const MOCK_TOKEN_SECRET = "mock-provider-signing-key";

export function issueToken(m: MockMerchant, ttlSec = 3600) {
  const body = Buffer.from(
    JSON.stringify({ p: m.provider, k: m.key, exp: Date.now() + ttlSec * 1000 }),
  ).toString("base64url");
  const sig = createHmac("sha256", MOCK_TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyBearer(req: Request, provider: Provider): MockMerchant | null {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", MOCK_TOKEN_SECRET).update(body).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const { p, k, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
  if (p !== provider || exp < Date.now()) return null;
  return MOCK_MERCHANTS.find((m) => m.provider === p && m.key === k) ?? null;
}

/** WorldFirst-style request signing: HMAC-SHA256(secret, `${METHOD} ${path}\n${clientId}.${requestTime}.${body}`) */
export function signRequest(secret: string, method: string, path: string, clientId: string, requestTime: string, body: string) {
  return createHmac("sha256", secret).update(`${method} ${path}\n${clientId}.${requestTime}.${body}`).digest("base64");
}

export async function verifySignedRequest(req: Request, path: string) {
  const clientId = req.headers.get("client-id") ?? "";
  const requestTime = req.headers.get("request-time") ?? "";
  const sigHeader = req.headers.get("signature") ?? "";
  const body = await req.text();
  const m = MOCK_MERCHANTS.find((x) => x.provider === "WORLDFIRST" && x.credentials.clientId === clientId);
  if (!m) return { merchant: null, body };
  if (Math.abs(Date.now() - Date.parse(requestTime)) > 5 * 60 * 1000) return { merchant: null, body };
  const sig = /signature=([^,]+)/.exec(sigHeader)?.[1] ?? "";
  const expected = signRequest(m.credentials.clientSecret, req.method, path, clientId, requestTime, body);
  return { merchant: sig === expected ? m : null, body };
}

export function webhookSignature(payload: string) {
  return createHmac("sha256", process.env.WEBHOOK_SECRET ?? "dev-webhook-secret").update(payload).digest("hex");
}
