/**
 * P1 — CSV/Formula Injection (auditoria Doações & Convênios 2026-08-05).
 * Garante que nenhuma célula vinda de formulário público chega ao Excel ou
 * LibreOffice interpretável como fórmula: gatilhos =, +, -, @, TAB e CR são
 * neutralizados com apóstrofo em CSV e Excel.
 */
import { describe, expect, it } from "vitest";
import { buildCsvContent, buildExcelRows, sanitizeSpreadsheetCell, type ReportColumn } from "../exportReport";

const COLUMNS: ReportColumn[] = [
  { header: "Entidade", key: "entidade" },
  { header: "Motivo", key: "motivo" },
];

// Sem ";" embutido — o caso de separador dentro da célula tem teste dedicado abaixo.
const DANGEROUS_PAYLOADS = [
  "=cmd|' /C calc'!A0",
  "=1+1",
  "+1+1",
  "-2+3",
  "@SUM(A1:A9)",
  "\t=HYPERLINK(evil,clique)",
  "\r=IMPORTXML(evil,//a)",
];

describe("sanitizeSpreadsheetCell", () => {
  it.each(DANGEROUS_PAYLOADS)("neutraliza gatilho de fórmula: %j", (payload) => {
    const out = String(sanitizeSpreadsheetCell(payload));
    expect(out.startsWith("'")).toBe(true);
    expect(out).toBe(`'${payload}`);
  });

  it("mantém texto comum intacto", () => {
    expect(sanitizeSpreadsheetCell("Clínica São José")).toBe("Clínica São José");
    expect(sanitizeSpreadsheetCell("Rua =falsa, 123")).toBe("Rua =falsa, 123"); // gatilho só no 1º caractere
  });

  it("mantém números legítimos (inclusive negativos) sem apóstrofo", () => {
    expect(sanitizeSpreadsheetCell(-5)).toBe(-5);
    expect(sanitizeSpreadsheetCell(150.75)).toBe(150.75);
  });

  it("normaliza null/undefined para vazio", () => {
    expect(sanitizeSpreadsheetCell(null)).toBe("");
    expect(sanitizeSpreadsheetCell(undefined)).toBe("");
  });
});

describe("buildCsvContent (exportação CSV)", () => {
  it("nenhuma célula do CSV final inicia com gatilho de fórmula", () => {
    const rows = DANGEROUS_PAYLOADS.map((p) => ({ entidade: p, motivo: `${p} extra` }));
    const csv = buildCsvContent(COLUMNS, rows);
    for (const line of csv.split("\r\n").slice(1)) {
      for (const cell of line.split(";")) {
        // célula pode vir entre aspas (escape CSV) — o conteúdo real começa após a aspa
        const content = cell.startsWith('"') ? cell.slice(1) : cell;
        expect(/^[=+\-@\t\r]/.test(content)).toBe(false);
        expect(content.startsWith("'")).toBe(true);
      }
    }
  });

  it("preserva escape de aspas/separador e o payload original (auditável) após o apóstrofo", () => {
    const csv = buildCsvContent(COLUMNS, [{ entidade: '=HYPERLINK("http://evil";"x")', motivo: "ok" }]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe(`"'=HYPERLINK(""http://evil"";""x"")";ok`);
  });

  it("separa com ; e usa CRLF (compatibilidade Excel pt-BR)", () => {
    const csv = buildCsvContent(COLUMNS, [{ entidade: "A", motivo: "B" }]);
    expect(csv).toBe("Entidade;Motivo\r\nA;B");
  });
});

describe("buildExcelRows (exportação Excel)", () => {
  it("sanitiza strings perigosas e mantém números como números", () => {
    const rows = buildExcelRows(
      [
        { header: "Doador", key: "donor" },
        { header: "Valor", key: "amount" },
      ],
      [{ donor: "=cmd|' /C calc'!A0", amount: 150.75 }]
    );
    expect(rows).toEqual([{ Doador: "'=cmd|' /C calc'!A0", Valor: 150.75 }]);
  });
});
