import ExcelJS from "exceljs";
import Papa from "papaparse";

export interface Sheet {
  headers: string[];
  rows: string[][];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
}

/** Nhiều file sao kê có vài dòng tiêu đề/ghi chú ở đầu → tìm dòng header thật */
function findHeaderRow(rows: string[][]) {
  const kw = /(date|time|amount|currency|transaction|status|type|日期|时间|金额|币种|ngày|số tiền|tiền tệ)/i;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const filled = rows[i].filter((c) => c.trim()).length;
    const hits = rows[i].filter((c) => kw.test(c)).length;
    if (filled >= 3 && hits >= 2) return i;
  }
  return 0;
}

export async function parseStatement(buf: Buffer, fileName: string): Promise<Sheet> {
  let raw: string[][];
  if (/\.(xlsx|xlsm)$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.rowCount > 1) ?? wb.worksheets[0];
    raw = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as ExcelJS.CellValue[]).slice(1);
      raw.push(vals.map(cellText));
    });
  } else if (/\.(csv|txt|tsv)$/i.test(fileName)) {
    let text = buf.toString("utf8").replace(/^﻿/, "");
    if (text.includes("�")) text = new TextDecoder("utf-16le").decode(buf); // một số file export UTF-16
    raw = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data.map((r) => r.map((c) => String(c ?? "")));
  } else {
    throw new Error("Chỉ hỗ trợ .csv, .tsv, .xlsx (file .xls cũ: mở bằng Excel rồi lưu lại thành .xlsx)");
  }
  if (!raw.length) throw new Error("File trống");
  const h = findHeaderRow(raw);
  const width = Math.max(...raw.slice(h).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (raw[h][i] ?? "").trim() || `Cột ${i + 1}`);
  const rows = raw
    .slice(h + 1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? "").trim()));
  return { headers, rows };
}
