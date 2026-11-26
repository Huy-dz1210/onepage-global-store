"use client";

import { useCart } from "./cart";

export function AddToCart({ productId, size = "sm" }: { productId: string; size?: "sm" | "lg" }) {
  const { add } = useCart();
  return (
    <button
      onClick={() => add(productId)}
      className={
        size === "lg"
          ? "w-full rounded-lg bg-stone-900 py-3 font-medium text-white hover:bg-stone-700"
          : "rounded-full border border-stone-300 px-3 py-1 text-sm hover:border-stone-900 hover:bg-stone-900 hover:text-white"
      }
    >
      Thêm vào giỏ
    </button>
  );
}
