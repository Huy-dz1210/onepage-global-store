export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-100">
      <div className="bg-amber-400 py-1 text-center text-xs font-medium text-amber-950">
        SANDBOX • Môi trường thử nghiệm – không phát sinh giao dịch tiền thật
      </div>
      <main className="mx-auto max-w-md px-4 py-8">{children}</main>
    </div>
  );
}
