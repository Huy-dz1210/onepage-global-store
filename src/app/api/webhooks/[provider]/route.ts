/**
 * Webhook nhận sự kiện từ provider (ở đây là mock). Provider thật cũng làm tương tự:
 * verify chữ ký → cập nhật đơn → kích hoạt sync ngay để giao dịch hiện lên dashboard.
 */
import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import type { Provider } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { webhookSignature } from "@/lib/mock/auth";
import { logEvent } from "@/lib/orders";
import { syncAccount } from "@/lib/sync";
import { completeTopup } from "@/lib/wallet";

type Payload = {
  id: string;
  event: string;
  data: {
    externalId: string;
    merchantKey: string;
    kind: string;
    amount: number;
    fee: number;
    currency: string;
    status: string;
    reference?: string;
    payerName: string;
  };
};

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = (await params).provider.toUpperCase() as Provider;
  const raw = await req.text();
  const sig = req.headers.get("x-mock-signature") ?? "";
  const expected = webhookSignature(raw);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { event, data } = JSON.parse(raw) as Payload;

  const account = await prisma.account.findFirst({ where: { provider, externalAccountId: data.merchantKey } });

  const order = data.reference
    ? await prisma.order.findFirst({ where: { OR: [{ number: data.reference }, { bankReference: data.reference }] } })
    : null;

  if (order) {
    await logEvent(order.id, "webhook.received", `Webhook ${provider} ${event} (${data.externalId})`, data);

    if (event === "inbound_transfer.received" && order.status === "AWAITING_TRANSFER") {
      if (data.currency !== order.currency) {
        await logEvent(order.id, "transfer.mismatch", `Nhận ${data.currency} nhưng đơn là ${order.currency} – cần xử lý tay`);
      } else if (data.amount + 1e-9 < Number(order.total)) {
        await logEvent(order.id, "transfer.underpaid", `Nhận ${data.amount} ${data.currency}, thiếu ${(Number(order.total) - data.amount).toFixed(2)}`);
      } else {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "PAID", paidAt: new Date(), paymentRef: data.externalId },
        });
        await logEvent(order.id, "transfer.matched", `Đối soát tự động: khớp nội dung ${data.reference} & số tiền → đơn đã thanh toán`);
      }
    }
  }

  // Nạp ví bằng chuyển khoản: ghi có đúng số tiền thực nhận
  const walletTx = data.reference ? await prisma.walletTransaction.findUnique({ where: { reference: data.reference } }) : null;
  if (walletTx && walletTx.status === "PENDING" && event === "inbound_transfer.received" && data.currency === walletTx.currency) {
    if (Number(walletTx.amount) !== data.amount) {
      await prisma.walletTransaction.update({
        where: { id: walletTx.id },
        data: { amount: data.amount, description: `${walletTx.description} (yêu cầu ${walletTx.amount}, thực nhận ${data.amount})` },
      });
    }
    await completeTopup(walletTx.id, data.externalId);
  }

  // Sync ngay để giao dịch + số dư cập nhật realtime
  if (account) {
    after(async () => {
      try {
        await syncAccount(account.id, "webhook");
        if (order) await logEvent(order.id, "ledger.synced", `Giao dịch ${data.externalId} đã ghi vào sổ ${account.name}`);
      } catch (e) {
        console.error("[webhook] sync failed", e);
      }
    });
  }

  return NextResponse.json({ received: true });
}
