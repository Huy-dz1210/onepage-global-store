import { notFound } from "next/navigation";
import { HostedCheckout } from "@/components/pay/hosted-checkout";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LOCAL_RECEIVING_ACCOUNTS } from "@/lib/mock/accounts";
import { expireIfStale, TOPUP_SESSION_MINUTES } from "@/lib/wallet";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/pay/${id}`);
  const tx = await expireIfStale(id);
  if (!tx || tx.userId !== user.id || tx.type !== "TOPUP") notFound();

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: tx.walletId } });
  const amount = Number(tx.amount);
  const balanceAfter = tx.balanceAfter !== null ? Number(tx.balanceAfter) : null;

  return (
    <HostedCheckout
      tx={{
        id: tx.id,
        status: tx.status,
        method: tx.method as "CARD" | "WALLET" | "BANK_TRANSFER",
        provider: tx.provider,
        amount,
        currency: tx.currency,
        reference: tx.reference,
        externalRef: tx.externalRef,
        description: tx.description,
        failReason: tx.failReason,
        createdAt: tx.createdAt.toISOString(),
        completedAt: tx.completedAt?.toISOString() ?? null,
        expiresAt: new Date(tx.createdAt.getTime() + TOPUP_SESSION_MINUTES * 60000).toISOString(),
        balanceBefore: balanceAfter !== null ? balanceAfter - amount : Number(wallet.balance),
        balanceAfter,
      }}
      user={{ name: user.name, email: user.email }}
      bank={tx.method === "BANK_TRANSFER" ? LOCAL_RECEIVING_ACCOUNTS[tx.currency] ?? null : null}
    />
  );
}
