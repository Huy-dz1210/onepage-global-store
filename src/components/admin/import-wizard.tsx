"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { previewImport, runImport } from "@/app/actions";
import { formatMoney } from "@/lib/fx";

type Account = { id: string; name: string; provider: string };
type Preview = Extract<Awaited<ReturnType<typeof previewImport>>, { ok: true }>;
type Result = Extract<Awaited<ReturnType<typeof runImport>>, { ok: true }>;

const sel = "rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm";
const LABEL: Record<string, string> = { PINGPONG: "PingPong", PAYONEER: "Payoneer", WORLDFIRST: "WorldFirst" };

export function ImportWizard({ accounts }: { accounts: Account[] }) {
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [dateFormat, setDateFormat] = useState("auto");
  const [mapping, setMapping] = useState<Record<string, number> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  function fd(withMapping: boolean) {
    const f = new FormData();
    f.set("file", file!);
    f.set("accountId", accountId);
    f.set("defaultCurrency", defaultCurrency);
    f.set("dateFormat", dateFormat);
    if (withMapping && mapping) f.set("mapping", JSON.stringify(mapping));
    return f;
  }

  function analyze(withMapping = false) {
    if (!file) return;
    setError(null);
    setResult(null);
    start(async () => {
      const r = await previewImport(fd(withMapping));
      if (!r.ok) return setError(r.error);
      setPreview(r);
      setMapping(r.mapping as Record<string, number>);
      if (!withMapping) setDateFormat(r.dateFormat);
    });
  }

  function commit() {
    start(async () => {
      const r = await runImport(fd(true));
      if (!r.ok) return setError(r.error);
      setResult(r);
    });
  }

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setMapping(null);
    setResult(null);
  }

  const account = accounts.find((a) => a.id === accountId);
  const mismatch = preview?.guessedProvider && account && preview.guessedProvider !== account.provider;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-stone-500 uppercase">Import vào tài khoản</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${sel} w-full`}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{LABEL[a.provider]} – {a.name}</option>)}
            </select>
          </label>
          <p className="text-xs text-stone-500">
            Chưa có tài khoản thật? <Link href="/admin/accounts" className="underline">Thêm tài khoản</Link> (base URL bỏ trống, credentials điền tạm) rồi tắt auto-sync cho nó.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-stone-500">Tiền tệ mặc định (nếu file không có cột)</span>
              <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} className={`${sel} w-full`}>
                {["USD", "EUR", "GBP", "JPY", "CNY", "HKD", "AUD", "CAD", "SGD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-stone-500">Định dạng ngày</span>
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className={`${sel} w-full`}>
                <option value="auto">Tự nhận diện</option>
                <option value="DMY">Ngày/Tháng/Năm</option>
                <option value="MDY">Tháng/Ngày/Năm</option>
              </select>
            </label>
          </div>
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center ${drag ? "border-emerald-500 bg-emerald-50" : "border-stone-300 hover:border-stone-500"}`}
        >
          <input type="file" accept=".csv,.tsv,.txt,.xlsx" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <span className="text-2xl">📄</span>
          <span className="mt-2 text-sm font-medium">{file ? file.name : "Kéo thả file sao kê vào đây hoặc bấm để chọn"}</span>
          <span className="text-xs text-stone-500">{file ? `${(file.size / 1024).toFixed(1)} KB` : "CSV, TSV, XLSX • tối đa 20MB"}</span>
        </label>

        <div className="lg:col-span-2">
          <button disabled={!file || !accountId || pending} onClick={() => analyze(false)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending && !preview ? "Đang đọc file…" : "Phân tích file"}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {preview && mapping && !result && (
        <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span><b>{preview.total}</b> dòng</span>
            <span className="text-emerald-700"><b>{preview.valid}</b> hợp lệ</span>
            {preview.total - preview.valid > 0 && <span className="text-amber-700"><b>{preview.total - preview.valid}</b> bỏ qua</span>}
            <span className="text-stone-500">Tiền tệ: {preview.currencies.join(", ") || "—"}</span>
            {preview.guessedProvider && <span className="text-stone-500">File có vẻ của <b>{LABEL[preview.guessedProvider]}</b></span>}
          </div>
          {mismatch && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              File có vẻ là của {LABEL[preview.guessedProvider!]} nhưng bạn đang import vào tài khoản {LABEL[account!.provider]}. Kiểm tra lại trước khi import.
            </p>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold text-stone-500 uppercase">Ghép cột (tự nhận diện – chỉnh nếu sai)</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(preview.fields).map(([key, label]) => (
                <label key={key} className="text-xs">
                  <span className="mb-0.5 block text-stone-500">{label}</span>
                  <select
                    value={mapping[key] ?? ""}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value === "") delete next[key];
                      else next[key] = Number(e.target.value);
                      setMapping(next);
                    }}
                    className={`${sel} w-full ${mapping[key] !== undefined ? "border-emerald-400" : ""}`}
                  >
                    <option value="">— không dùng —</option>
                    {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <button disabled={pending} onClick={() => analyze(true)} className="mt-3 rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:border-stone-900 disabled:opacity-50">
              {pending ? "Đang tính lại…" : "Áp dụng & xem lại"}
            </button>
          </div>

          {preview.errors.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-amber-700">Xem dòng bị bỏ qua</summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-stone-600">
                {preview.errors.map((e) => e && <li key={e.row}>Dòng {e.row}: {e.error}</li>)}
              </ul>
            </details>
          )}

          <div className="overflow-x-auto">
            <p className="mb-2 text-xs font-semibold text-stone-500 uppercase">Xem trước sau chuẩn hóa</p>
            <table className="w-full text-xs">
              <thead className="text-left text-stone-500">
                <tr>{["Ngày", "Chiều", "Loại", "Trạng thái", "Số tiền", "Phí", "Đối tác / Nội dung", "Mã GD"].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {preview.preview.map((t) => (
                  <tr key={t.externalId}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{t.occurredAt.slice(0, 16).replace("T", " ")}</td>
                    <td className={`px-2 py-1.5 ${t.direction === "IN" ? "text-emerald-700" : ""}`}>{t.direction === "IN" ? "Vào" : "Ra"}</td>
                    <td className="px-2 py-1.5 font-mono">{t.type}</td>
                    <td className="px-2 py-1.5">{t.status}</td>
                    <td className="tabular px-2 py-1.5 text-right">{formatMoney(t.amount, t.currency)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{t.fee ? formatMoney(t.fee, t.currency) : "—"}</td>
                    <td className="max-w-64 truncate px-2 py-1.5">{[t.counterparty, t.description].filter(Boolean).join(" • ")}</td>
                    <td className="max-w-32 truncate px-2 py-1.5 font-mono">{t.externalId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button disabled={pending || preview.valid === 0} onClick={commit} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {pending ? "Đang import…" : `Import ${preview.valid} giao dịch vào ${account?.name}`}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-semibold">Import xong ✓</p>
          <p className="mt-1">
            {result.total} dòng • <b>+{result.inserted}</b> mới • {result.updated} cập nhật trạng thái • {result.skipped} bỏ qua
            {result.balances > 0 && ` • cập nhật số dư ${result.balances} ví`}
          </p>
          <div className="mt-3 flex gap-3">
            <Link href={`/admin/transactions?account=${accountId}`} className="font-medium underline">Xem giao dịch</Link>
            <button onClick={() => { setFile(null); setPreview(null); setResult(null); }} className="underline">Import file khác</button>
          </div>
        </div>
      )}
    </div>
  );
}
