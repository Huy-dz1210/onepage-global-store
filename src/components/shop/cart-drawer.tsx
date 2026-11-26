"use client";

import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/fx";
import { shippingFor, type ShopCurrency } from "@/lib/currency";
import { useCart } from "./cart";

export function CartButton() {
  const { count, setOpen } = useCart();
  return (
    <button onClick={() => setOpen(true)} className="relative rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
      Giỏ hàng
      {count > 0 && <span className="ml-2 rounded-full bg-white px-1.5 text-xs text-stone-900">{count}</span>}
    </button>
  );
}

export function CartDrawer() {
  const { open, setOpen, lines, subtotal, currency, setQty } = useCart();
  const shipping = shippingFor(currency as ShopCurrency, subtotal);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-stone-900/30" onClick={() => setOpen(false)} />
      <aside className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Giỏ hàng</h2>
          <button onClick={() => setOpen(false)} className="text-stone-500 hover:text-stone-900" aria-label="Đóng">✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {lines.length === 0 && <p className="text-sm text-stone-500">Chưa có sản phẩm nào.</p>}
          {lines.map((l) => (
            <div key={l.productId} className="flex gap-3">
              <Image src={l.product.image} alt="" width={64} height={64} className="rounded-lg" />
              <div className="flex-1">
                <p className="text-sm font-medium">{l.product.name}</p>
                <p className="text-xs text-stone-500">{formatMoney(l.product.price, currency)}</p>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <button onClick={() => setQty(l.productId, l.quantity - 1)} className="size-6 rounded border">−</button>
                  <span className="tabular w-5 text-center">{l.quantity}</span>
                  <button onClick={() => setQty(l.productId, l.quantity + 1)} className="size-6 rounded border">+</button>
                </div>
              </div>
              <p className="tabular text-sm font-medium">{formatMoney(l.product.price * l.quantity, currency)}</p>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="space-y-2 border-t px-5 py-4 text-sm">
            <Row label="Tạm tính" value={formatMoney(subtotal, currency)} />
            <Row label="Vận chuyển" value={shipping === 0 ? "Miễn phí" : formatMoney(shipping, currency)} />
            <Row label="Tổng" value={formatMoney(subtotal + shipping, currency)} bold />
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-lg bg-stone-900 py-3 text-center font-medium text-white hover:bg-stone-700"
            >
              Thanh toán bằng {currency} →
            </Link>
            <p className="text-center text-xs text-stone-500">Trả bằng tiền tệ của bạn – không phí đổi ngoại tệ.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-semibold" : "text-stone-600"}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
