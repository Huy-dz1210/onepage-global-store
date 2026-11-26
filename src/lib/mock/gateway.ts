/**
 * Mock payment gateway dùng chung cho 3 provider:
 * ghi giao dịch vào "sổ cái" của provider (MockPayment) rồi bắn webhook về app.
 */
import { prisma } from "@/lib/db";
import { roundCurrency } from "@/lib/fx";
import type { Prisma } from "@/generated/prisma/client";
import type { Provider } from "@/generated/prisma/enums";
import { hash } from "./rng";
import { webhookSignature } from "./auth";

export type GatewayKind = "CARD_ACQUIRING" | "WALLET_PAY" | "BANK_INBOUND";

export const GATEWAY_FEE_RATE: Record<GatewayKind, number> = {
  CARD_ACQUIRING: 0.025,
  WALLET_PAY: 0.005,
  BANK_INBOUND: 0,
};

export async function recordPayment(input: {
  provider: Provider;
  merchantKey: string;
  kind: GatewayKind;
  amount: number;
  currency: string;
  status: "COMPLETED" | "FAILED" | "PENDING";
  payerName: string;
  payerEmail?: string;
  reference?: string;
  description?: string;
  meta?: Record<string, unknown>;
}) {
  const seed = hash(`${input.provider}${input.reference}${Date.now()}${Math.random()}`);
  const prefix = ({ PINGPONG: "PPC", PAYONEER: "PYC", WORLDFIRST: "WFC" } as Record<string, string>)[input.provider];
  const externalId = `${prefix}${Date.now().toString(36).toUpperCase()}${seed.toString(36).toUpperCase()}`;
  const fee = roundCurrency(input.amount * GATEWAY_FEE_RATE[input.kind], input.currency);

  const payment = await prisma.mockPayment.create({
    data: {
      provider: input.provider,
      merchantKey: input.merchantKey,
      externalId,
      kind: input.kind,
      amount: input.amount,
      fee,
      currency: input.currency,
      status: input.status,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      reference: input.reference,
      description: input.description,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
    },
  });

  // webhook bất đồng bộ, như provider thật
  void sendWebhook(input.provider, {
    event:
      input.kind === "BANK_INBOUND"
        ? "inbound_transfer.received"
        : input.status === "COMPLETED"
          ? "payment.succeeded"
          : "payment.failed",
    data: {
      externalId,
      merchantKey: input.merchantKey,
      kind: input.kind,
      amount: input.amount,
      fee,
      currency: input.currency,
      status: input.status,
      reference: input.reference,
      payerName: input.payerName,
      createdAt: payment.createdAt.toISOString(),
    },
  });

  return payment;
}

async function sendWebhook(provider: Provider, body: Record<string, unknown>) {
  const url = `${process.env.APP_URL ?? "http://127.0.0.1:3000"}/api/webhooks/${provider.toLowerCase()}`;
  const payload = JSON.stringify({ id: `evt_${Date.now()}`, ...body });
  await new Promise((r) => setTimeout(r, 300));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-mock-signature": webhookSignature(payload) },
        body: payload,
      });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  console.error(`[mock:${provider}] webhook failed after retries`);
}

/** Thẻ test kiểu Stripe/PingPong */
export function evaluateTestCard(number: string): { ok: boolean; reason?: string; brand: string } {
  const n = number.replace(/\s+/g, "");
  const brand = n.startsWith("4") ? "Visa" : n.startsWith("5") ? "Mastercard" : n.startsWith("3") ? "Amex" : "Card";
  if (!/^\d{13,19}$/.test(n)) return { ok: false, reason: "invalid_card_number", brand };
  if (n === "4000000000000002") return { ok: false, reason: "card_declined", brand };
  if (n === "4000000000009995") return { ok: false, reason: "insufficient_funds", brand };
  if (n === "4000000000000069") return { ok: false, reason: "expired_card", brand };
  return { ok: true, brand };
}
