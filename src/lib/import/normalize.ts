/**
 * Chuẩn hóa sao kê PingPong / Payoneer / WorldFirst (và file bất kỳ) về NormalizedTx.
 * Tự nhận diện cột theo từ khóa EN / 中文 / VI; người dùng có thể chỉnh mapping trên UI.
 */
import { createHash } from "node:crypto";
import type { Direction, TxStatus, TxType } from "@/generated/prisma/enums";
import { decimalsOf } from "@/lib/fx";
import type { NormalizedTx } from "@/lib/providers/types";

export const FIELDS = {
  externalId: "Mã giao dịch",
  date: "Ngày giờ",
  amount: "Số tiền (+/-)",
  credit: "Tiền vào",
  debit: "Tiền ra",
  currency: "Tiền tệ",
  fee: "Phí",
  direction: "Chiều tiền",
  type: "Loại GD",
  status: "Trạng thái",
  description: "Nội dung",
  counterparty: "Đối tác",
  reference: "Tham chiếu",
  balance: "Số dư sau GD",
} as const;

export type Field = keyof typeof FIELDS;
export type Mapping = Partial<Record<Field, number>>;
export type DateFormat = "auto" | "DMY" | "MDY";

const SYNONYMS: Record<Field, string[]> = {
  externalId: ["transaction id", "transaction no", "transaction number", "trans id", "txn id", "id", "交易流水号", "流水号", "交易号", "交易编号", "mã giao dịch", "mã gd"],
  date: ["date", "transaction date", "transaction time", "created", "created at", "create time", "time", "date time", "completed date", "日期", "交易时间", "时间", "创建时间", "ngày", "thời gian", "ngày giao dịch"],
  amount: ["amount", "transaction amount", "net amount", "gross amount", "金额", "交易金额", "số tiền"],
  credit: ["credit", "money in", "paid in", "incoming", "收入", "入账金额", "入账", "tiền vào", "ghi có"],
  debit: ["debit", "money out", "paid out", "outgoing", "支出", "出账金额", "出账", "tiền ra", "ghi nợ"],
  currency: ["currency", "ccy", "currency code", "币种", "货币", "tiền tệ", "loại tiền"],
  fee: ["fee", "fees", "fee amount", "手续费", "费用", "phí"],
  direction: ["direction", "in/out", "dr/cr", "debit/credit", "收支类型", "收支", "chiều"],
  type: ["type", "transaction type", "category", "交易类型", "业务类型", "类型", "loại", "loại giao dịch"],
  status: ["status", "state", "transaction status", "状态", "交易状态", "trạng thái"],
  description: ["description", "details", "memo", "remark", "remarks", "note", "备注", "说明", "nội dung", "mô tả", "ghi chú"],
  counterparty: ["counterparty", "payer", "payee", "from", "to", "name", "source", "merchant", "对方", "对方名称", "付款方", "收款方", "đối tác", "người gửi", "người nhận"],
  reference: ["reference", "reference id", "reference no", "order id", "order no", "参考号", "订单号", "tham chiếu"],
  balance: ["balance", "running balance", "balance after", "余额", "số dư"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-.:()[\]]/g, " ").replace(/\s+/g, " ").trim();

export function autoMap(headers: string[]): Mapping {
  const map: Mapping = {};
  const used = new Set<number>();
  const H = headers.map(norm);
  // 1) khớp chính xác, 2) chứa từ khóa
  for (const pass of ["exact", "contains"] as const) {
    for (const f of Object.keys(SYNONYMS) as Field[]) {
      if (map[f] !== undefined) continue;
      const idx = H.findIndex(
        (h, i) => !used.has(i) && SYNONYMS[f].some((s) => (pass === "exact" ? h === s : s.length > 2 && h.includes(s))),
      );
      if (idx >= 0) {
        map[f] = idx;
        used.add(idx);
      }
    }
  }
  return map;
}

/** Nhận diện provider từ header / tên file */
export function guessProvider(headers: string[], fileName: string) {
  const t = (headers.join(" ") + " " + fileName).toLowerCase();
  if (/payoneer/.test(t)) return "PAYONEER";
  if (/worldfirst|world first|万里汇/.test(t)) return "WORLDFIRST";
  if (/pingpong|ping pong|乒乓/.test(t)) return "PINGPONG";
  return null;
}

const CURRENCY_RE = /\b(USD|EUR|GBP|JPY|CNY|CNH|HKD|AUD|CAD|SGD|NZD|CHF|VND|MXN|PLN|SEK|AED)\b/i;
const SYMBOL: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₫": "VND" };

export function parseAmount(raw: string): { value: number | null; currency?: string } {
  if (!raw) return { value: null };
  let s = raw.trim();
  const cur = CURRENCY_RE.exec(s)?.[1]?.toUpperCase() ?? Object.entries(SYMBOL).find(([k]) => s.includes(k))?.[1];
  const negative = /^\(.*\)$/.test(s) || /^-|−/.test(s.replace(CURRENCY_RE, "").trim()) || /-\s*$/.test(s);
  s = s.replace(CURRENCY_RE, "").replace(/[^\d.,]/g, "");
  if (!s) return { value: null, currency: cur };
  // "1.234,56" (EU) vs "1,234.56"
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot && s.length - lastComma <= 3) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const v = Number(s);
  return { value: Number.isFinite(v) ? (negative ? -v : v) : null, currency: cur === "CNH" ? "CNY" : cur };
}

export function parseDate(raw: string, fmt: DateFormat): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{10,13}$/.test(s)) return new Date(Number(s) * (s.length === 10 ? 1000 : 1));
  // Excel serial
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Math.round((Number(s) - 25569) * 86400000));
  // YYYY-MM-DD / YYYY/MM/DD (+ time)
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  if (m) return new Date(s);
  // DD/MM/YYYY hoặc MM/DD/YYYY
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(s);
  if (m) {
    const a = +m[1], b = +m[2];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const dmy = fmt === "DMY" || (fmt === "auto" && !(b > 12));
    const [day, month] = dmy ? [a, b] : [b, a];
    let hh = +(m[4] ?? 0);
    if (m[7]?.toUpperCase() === "PM" && hh < 12) hh += 12;
    if (m[7]?.toUpperCase() === "AM" && hh === 12) hh = 0;
    return new Date(Date.UTC(y, month - 1, day, hh, +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  const d = new Date(s); // "Mar 5, 2026 10:22 AM"…
  return isNaN(+d) ? null : d;
}

function mapStatus(s: string): TxStatus {
  const t = s.toLowerCase();
  if (!t) return "COMPLETED";
  if (/(fail|reject|declin|失败|拒绝|thất bại)/.test(t)) return "FAILED";
  if (/(cancel|void|revers|取消|撤销|hủy)/.test(t)) return "CANCELLED";
  if (/(pend|process|review|hold|progress|处理中|审核|待|đang)/.test(t)) return "PENDING";
  return "COMPLETED";
}

function mapType(s: string, direction: Direction): TxType {
  const t = s.toLowerCase();
  if (/(exchange|conver|fx|换汇|兑换|đổi tiền)/.test(t)) return "FX";
  if (/(withdraw|提现|rút)/.test(t)) return "WITHDRAWAL";
  if (/(refund|退款|hoàn)/.test(t)) return "REFUND";
  if (/(fee|charge fee|手续费|费用|phí)/.test(t)) return "FEE";
  if (/(card|卡)/.test(t)) return "CARD";
  if (/(amazon|shopify|ebay|walmart|etsy|marketplace|settlement|collection|收款|回款|payment received|store|店铺)/.test(t)) return "COLLECTION";
  if (/(transfer in|incoming|received|inbound|入账|转入|nhận)/.test(t)) return "TRANSFER_IN";
  if (/(payment|pay|付款|支付|thanh toán)/.test(t)) return direction === "IN" ? "COLLECTION" : "PAYMENT";
  return direction === "IN" ? "TRANSFER_IN" : "PAYMENT";
}

function inferDirection(text: string): Direction | null {
  const t = text.toLowerCase();
  if (/(^|\b)(in|credit|cr|收入|入账|vào|ghi có)(\b|$)/.test(t)) return "IN";
  if (/(^|\b)(out|debit|dr|支出|出账|ra|ghi nợ)(\b|$)/.test(t)) return "OUT";
  return null;
}

export interface RowResult {
  ok: boolean;
  error?: string;
  tx?: NormalizedTx;
  balance?: { currency: string; value: number; at: Date };
}

export function normalizeRow(
  row: string[],
  headers: string[],
  map: Mapping,
  opts: { accountKey: string; defaultCurrency: string; dateFormat: DateFormat },
): RowResult {
  const get = (f: Field) => (map[f] !== undefined ? (row[map[f]!] ?? "").trim() : "");

  const date = parseDate(get("date"), opts.dateFormat);
  if (!date) return { ok: false, error: `Không đọc được ngày "${get("date")}"` };

  let amountSigned: number | null = null;
  let cur = get("currency").toUpperCase().slice(0, 3) || undefined;
  if (map.amount !== undefined) {
    const a = parseAmount(get("amount"));
    amountSigned = a.value;
    cur = cur ?? a.currency;
  }
  if (amountSigned === null && (map.credit !== undefined || map.debit !== undefined)) {
    const c = parseAmount(get("credit")), d = parseAmount(get("debit"));
    cur = cur ?? c.currency ?? d.currency;
    if (c.value) amountSigned = Math.abs(c.value);
    else if (d.value) amountSigned = -Math.abs(d.value);
  }
  if (amountSigned === null || amountSigned === 0) return { ok: false, error: "Thiếu số tiền" };
  const currency = (cur && /^[A-Z]{3}$/.test(cur) ? cur : opts.defaultCurrency).toUpperCase();

  const typeText = `${get("type")} ${get("description")}`;
  let direction: Direction =
    inferDirection(get("direction")) ?? (amountSigned < 0 ? "OUT" : null) ?? (/(withdraw|fee|payment to|charge|提现|支出|付款)/i.test(typeText) && map.credit === undefined ? "OUT" : "IN");
  if (amountSigned < 0) direction = "OUT";

  const amount = Math.round(Math.abs(amountSigned) * 10 ** decimalsOf(currency)) / 10 ** decimalsOf(currency);
  const fee = Math.abs(parseAmount(get("fee")).value ?? 0);
  const description = get("description") || get("type") || undefined;
  const externalId =
    get("externalId") ||
    "imp_" + createHash("sha256").update([opts.accountKey, date.toISOString(), direction, amount, currency, description, get("reference")].join("|")).digest("hex").slice(0, 24);

  const raw: Record<string, string> = {};
  headers.forEach((h, i) => (raw[h] = row[i] ?? ""));
  const bal = map.balance !== undefined ? parseAmount(get("balance")).value : null;

  return {
    ok: true,
    tx: {
      externalId,
      direction,
      type: mapType(typeText, direction),
      status: mapStatus(get("status")),
      amount,
      currency,
      fee,
      feeCurrency: currency,
      counterparty: get("counterparty") || undefined,
      description,
      reference: get("reference") || undefined,
      occurredAt: date,
      raw,
    },
    balance: bal !== null ? { currency, value: bal, at: date } : undefined,
  };
}

/** Đoán DD/MM hay MM/DD dựa trên cả cột ngày */
export function detectDateFormat(values: string[]): DateFormat {
  for (const v of values) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12) return "DMY";
    if (+m[2] > 12) return "MDY";
  }
  return "DMY";
}
