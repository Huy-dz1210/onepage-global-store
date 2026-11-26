"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "@/lib/shop-server";

type Line = { productId: string; quantity: number };
type CartCtx = {
  lines: (Line & { product: CatalogItem })[];
  count: number;
  subtotal: number;
  currency: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "onepage-cart";

export function CartProvider({ catalog, currency, children }: { catalog: CatalogItem[]; currency: string; children: React.ReactNode }) {
  const [raw, setRaw] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRaw(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {}
  }, []);

  const persist = useCallback((next: Line[]) => {
    setRaw(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const lines = useMemo(
    () =>
      raw
        .map((l) => ({ ...l, product: catalog.find((p) => p.id === l.productId)! }))
        .filter((l) => l.product && l.quantity > 0),
    [raw, catalog],
  );

  const value: CartCtx = {
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: Math.round(lines.reduce((s, l) => s + l.quantity * l.product.price, 0) * 100) / 100,
    currency,
    open,
    setOpen,
    add: (id, qty = 1) => {
      const ex = raw.find((l) => l.productId === id);
      persist(ex ? raw.map((l) => (l.productId === id ? { ...l, quantity: l.quantity + qty } : l)) : [...raw, { productId: id, quantity: qty }]);
      setOpen(true);
    },
    setQty: (id, qty) => persist(raw.map((l) => (l.productId === id ? { ...l, quantity: Math.max(0, qty) } : l)).filter((l) => l.quantity > 0)),
    clear: () => persist([]),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
