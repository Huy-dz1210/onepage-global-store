import { TopupForm } from "@/components/shop/topup-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrency } from "@/lib/shop-server";

export default async function TopupPage({ searchParams }: { searchParams: Promise<{ currency?: string; amount?: string }> }) {
  const user = await requireUser("/account/wallet/topup");
  const sp = await searchParams;
  const currency = sp.currency ?? (await getCurrency());
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
  const balances = Object.fromEntries(wallets.map((w) => [w.currency, Number(w.balance)]));
  return <TopupForm defaultCurrency={currency} defaultAmount={sp.amount ? Number(sp.amount) : undefined} balances={balances} />;
}
