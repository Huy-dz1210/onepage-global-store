"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register } from "@/app/actions";

const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, undefined);
  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {mode === "login" ? "Để thanh toán, nạp ví và xem lịch sử giao dịch." : "Mỗi tài khoản có ví đa tiền tệ riêng."}
        </p>
      </div>
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next ?? "/account"} />
        {mode === "register" && <input name="name" required placeholder="Họ tên" className={input} autoComplete="name" />}
        <input name="email" type="email" required placeholder="Email" className={input} autoComplete="email" />
        <input name="password" type="password" required placeholder="Mật khẩu" className={input} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-stone-900 py-2.5 font-medium text-white hover:bg-stone-700 disabled:opacity-60">
          {pending ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
      </form>
      <p className="text-center text-sm text-stone-600">
        {mode === "login" ? (
          <>Chưa có tài khoản? <Link href={`/register?next=${encodeURIComponent(next ?? "/account")}`} className="font-medium underline">Đăng ký</Link></>
        ) : (
          <>Đã có tài khoản? <Link href={`/login?next=${encodeURIComponent(next ?? "/account")}`} className="font-medium underline">Đăng nhập</Link></>
        )}
      </p>
      {mode === "login" && (
        <div className="rounded-lg border border-dashed border-stone-300 p-3 text-xs text-stone-600">
          <p className="mb-1 font-semibold">Tài khoản demo</p>
          <p><span className="font-mono">user1@onepage.demo</span> / <span className="font-mono">123456</span> (có sẵn tiền trong ví)</p>
          <p><span className="font-mono">user2@onepage.demo</span> / <span className="font-mono">123456</span></p>
          <p><span className="font-mono">admin@onepage.demo</span> / <span className="font-mono">admin123</span> (quản trị)</p>
        </div>
      )}
    </div>
  );
}
