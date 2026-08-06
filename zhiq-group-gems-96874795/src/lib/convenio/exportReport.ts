import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface ReportColumn {
  header: string;
  key: string;
}

/**
 * Neutralização de CSV/Formula Injection (OWASP).
 * Células vindas de formulários públicos (indicações, leads, doadores) podem
 * começar com um gatilho de fórmula e seriam executadas pelo Excel/LibreOffice
 * ao abrir o arquivo exportado (ex.: `=cmd|' /C calc'!A0`, `@SUM(...)`,
 * `+1+1`, `-2+3`, TAB e CR também disparam interpretação).
 * O prefixo apóstrofo (`'`) força o interpretador a tratar a célula como
 * texto literal. Valores numéricos (number/bigint) não carregam payload e
 * seguem intactos para não quebrar negativos legítimos.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function sanitizeSpreadsheetCell(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return value;
  if (value === null || value === undefined) return "";
  const s = String(value);
  return FORMULA_TRIGGER.test(s) ? `'${s}` : s;
}

/** Monta o conteúdo CSV (sem BOM) — puro e testável, não toca no DOM. */
export function buildCsvContent(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const sep = ";"; // Excel pt-BR abre ponto-e-vírgula direto, sem assistente de importação
  const escapeCell = (value: unknown) => {
    const s = String(sanitizeSpreadsheetCell(value));
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(sep),
    ...rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(sep)),
  ];
  return lines.join("\r\n");
}

/** Monta as linhas do Excel já sanitizadas — puro e testável. */
export function buildExcelRows(columns: ReportColumn[], rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (const c of columns) record[c.header] = sanitizeSpreadsheetCell(row[c.key]);
    return record;
  });
}

export function exportReportToPdf(title: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ""))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 122, 87] },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

export function exportReportToCsv(title: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  // U+FEFF (BOM) — sem ele o Excel abre acentos UTF-8 quebrados
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + buildCsvContent(columns, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.toLowerCase().replace(/\s+/g, "-")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportReportToExcel(title: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(buildExcelRows(columns, rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
  XLSX.writeFile(workbook, `${title.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
}
