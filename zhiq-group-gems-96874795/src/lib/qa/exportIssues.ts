/**
 * ORION-QA Fase 1 — exportação da listagem de problemas.
 * CSV entregue nesta fase; Excel e PDF já preparados sobre a mesma interface
 * de colunas (jspdf/xlsx são dependências existentes do projeto).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface QaExportColumn {
  header: string;
  key: string;
}

function fileSlug(title: string) {
  return title.toLowerCase().replace(/\s+/g, "-");
}

export function exportQaCsv(title: string, columns: QaExportColumn[], rows: Record<string, unknown>[]) {
  const sep = ";"; // Excel pt-BR abre ponto-e-vírgula direto, sem assistente de importação
  const escapeCell = (value: unknown) => {
    const s = String(value ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(sep),
    ...rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(sep)),
  ];
  // U+FEFF (BOM) — sem ele o Excel abre acentos UTF-8 quebrados
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileSlug(title)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportQaExcel(title: string, columns: QaExportColumn[], rows: Record<string, unknown>[]) {
  const data = rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (const c of columns) record[c.header] = row[c.key] ?? "";
    return record;
  });
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
  XLSX.writeFile(workbook, `${fileSlug(title)}.xlsx`);
}

export interface QaPdfSummaryItem {
  label: string;
  value: string;
}

export interface QaPdfOptions {
  /** Descrição dos filtros ativos no momento da exportação. */
  filtersDescription?: string;
  /** Indicadores exibidos no cabeçalho (Total, Abertos, Críticos, MTTR…). */
  summary?: QaPdfSummaryItem[];
}

/** PDF Premium: faixa de marca, indicadores, filtros ativos e rodapé paginado. */
export function exportQaPdf(
  title: string,
  columns: QaExportColumn[],
  rows: Record<string, unknown>[],
  options: QaPdfOptions = {},
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const brand: [number, number, number] = [30, 64, 175];

  // Faixa de marca
  doc.setFillColor(...brand);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    `ORION-QA · Central de Problemas · gerado em ${new Date().toLocaleString("pt-BR")}`,
    14, 16,
  );

  let cursorY = 28;

  // Indicadores
  if (options.summary && options.summary.length > 0) {
    doc.setTextColor(30, 30, 30);
    const slotWidth = (pageWidth - 28) / options.summary.length;
    options.summary.forEach((item, idx) => {
      const x = 14 + idx * slotWidth;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, x, cursorY + 2);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(110, 110, 110);
      doc.text(item.label.toUpperCase(), x, cursorY + 7);
      doc.setTextColor(30, 30, 30);
    });
    cursorY += 13;
  }

  // Filtros ativos
  if (options.filtersDescription) {
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(`Filtros: ${options.filtersDescription}`, 14, cursorY, { maxWidth: pageWidth - 28 });
    cursorY += 7;
  }

  autoTable(doc, {
    startY: cursorY,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ""))),
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    headStyles: { fillColor: brand, fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 248, 252] },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text(
        `${rows.length} problema(s) · página ${doc.getCurrentPageInfo().pageNumber}`,
        pageWidth - 14, pageHeight - 6, { align: "right" },
      );
    },
  });

  doc.save(`${fileSlug(title)}.pdf`);
}

/** JSON estruturado — mesmos registros filtrados exibidos na listagem. */
export function exportQaJson(title: string, rows: Record<string, unknown>[]) {
  const payload = {
    origem: "ORION-QA · Central de Problemas",
    gerado_em: new Date().toISOString(),
    total: rows.length,
    problemas: rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileSlug(title)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
