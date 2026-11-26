import { CheckoutForm } from "@/components/shop/checkout-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrency } from "@/lib/shop-server";

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const currency = await getCurrency();
  const wallet = await prisma.wallet.findUnique({ where: { userId_currency: { userId: user.id, currency } } });
  return <CheckoutForm user={{ name: user.name, email: user.email }} walletBalance={Number(wallet?.balance ?? 0)} />;
}
