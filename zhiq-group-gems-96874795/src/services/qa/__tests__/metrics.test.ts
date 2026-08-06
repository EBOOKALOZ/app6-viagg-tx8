import { describe, it, expect } from "vitest";
import {
  assigneeStats,
  avgTimePerStatus,
  buildHeatmap,
  computeMtbfMs,
  computeMttrMs,
  countInLastDays,
  dailySeries,
  formatDurationMs,
  type QaHistoryRow,
  type QaStatRow,
} from "../metrics";

const NOW = new Date("2026-08-05T12:00:00Z");
const HOUR = 3_600_000;

function row(overrides: Partial<QaStatRow> = {}): QaStatRow {
  return {
    id: "1",
    status: "novo",
    severity: "medio",
    module: "geral",
    environment: "producao",
    origin: "manual",
    assigned_to: null,
    created_at: "2026-08-04T12:00:00Z",
    resolved_at: null,
    closed_at: null,
    reopen_count: 0,
    ...overrides,
  };
}

describe("MTTR / MTBF", () => {
  it("MTTR = média de resolved_at − created_at (ignora não resolvidos)", () => {
    const rows = [
      row({ id: "a", created_at: "2026-08-01T00:00:00Z", resolved_at: "2026-08-01T02:00:00Z" }),
      row({ id: "b", created_at: "2026-08-02T00:00:00Z", resolved_at: "2026-08-02T04:00:00Z" }),
      row({ id: "c" }), // aberto — fora do cálculo
    ];
    expect(computeMttrMs(rows)).toBe(3 * HOUR);
  });

  it("MTBF = gap médio entre criações consecutivas", () => {
    const rows = [
      row({ id: "a", created_at: "2026-08-01T00:00:00Z" }),
      row({ id: "b", created_at: "2026-08-01T06:00:00Z" }),
      row({ id: "c", created_at: "2026-08-01T18:00:00Z" }),
    ];
    expect(computeMtbfMs(rows)).toBe(9 * HOUR);
  });

  it("retornam null sem dados suficientes", () => {
    expect(computeMttrMs([row()])).toBeNull();
    expect(computeMtbfMs([row()])).toBeNull();
  });
});

describe("séries e contagens", () => {
  it("dailySeries cobre todos os dias (com zeros) e conta criados/fechados", () => {
    const rows = [
      row({ id: "a", created_at: "2026-08-04T08:00:00Z", closed_at: "2026-08-05T09:00:00Z" }),
      row({ id: "b", created_at: "2026-08-04T10:00:00Z" }),
    ];
    const series = dailySeries(rows, 7, NOW);
    expect(series).toHaveLength(7);
    const day4 = series.find((p) => p.date === "2026-08-04");
    const day5 = series.find((p) => p.date === "2026-08-05");
    expect(day4?.criados).toBe(2);
    expect(day5?.fechados).toBe(1);
    expect(series.filter((p) => p.criados === 0 && p.fechados === 0).length).toBe(5);
  });

  it("countInLastDays respeita a janela", () => {
    const rows = [
      row({ id: "a", created_at: "2026-08-04T12:00:00Z" }),
      row({ id: "b", created_at: "2026-07-01T12:00:00Z" }),
    ];
    expect(countInLastDays(rows, 7, NOW)).toBe(1);
    expect(countInLastDays(rows, 60, NOW)).toBe(2);
  });
});

describe("avgTimePerStatus", () => {
  it("segmenta a linha do tempo por eventos de status", () => {
    const history: QaHistoryRow[] = [
      { issue_id: "a", event_type: "criacao", old_value: null, new_value: "novo", created_at: "2026-08-05T00:00:00Z" },
      { issue_id: "a", event_type: "mudanca_status", old_value: "novo", new_value: "em_analise", created_at: "2026-08-05T02:00:00Z" },
      { issue_id: "a", event_type: "fechamento", old_value: "em_analise", new_value: "fechado", created_at: "2026-08-05T05:00:00Z" },
    ];
    const avg = avgTimePerStatus(history, NOW);
    expect(avg["novo"]).toBe(2 * HOUR);
    expect(avg["em_analise"]).toBe(3 * HOUR);
    expect(avg["fechado"]).toBe(7 * HOUR); // corrente até NOW (12h)
  });
});

describe("assigneeStats (Painel do Responsável)", () => {
  it("agrupa por responsável e ordena o ranking por resolvidos", () => {
    const rows = [
      row({ id: "a", assigned_to: "dev1", status: "fechado", created_at: "2026-08-01T00:00:00Z", resolved_at: "2026-08-01T02:00:00Z" }),
      row({ id: "b", assigned_to: "dev1", status: "homologado", created_at: "2026-08-02T00:00:00Z", resolved_at: "2026-08-02T02:00:00Z" }),
      row({ id: "c", assigned_to: "dev2", status: "em_homologacao" }),
      row({ id: "d", assigned_to: "dev2", status: "novo", severity: "critico" }),
      row({ id: "e", assigned_to: null }), // sem responsável — fora
    ];
    const stats = assigneeStats(rows);
    expect(stats).toHaveLength(2);
    expect(stats[0].assignedTo).toBe("dev1");
    expect(stats[0].resolvidos).toBe(2);
    expect(stats[0].tempoMedioMs).toBe(2 * HOUR);
    expect(stats[1].criticos).toBe(1);
    expect(stats[1].emHomologacao).toBe(1);
  });
});

describe("buildHeatmap", () => {
  it("agrupa por módulo × dia com máximo correto", () => {
    const rows = [
      row({ id: "a", module: "fretes", created_at: "2026-08-05T01:00:00Z" }),
      row({ id: "b", module: "fretes", created_at: "2026-08-05T02:00:00Z" }),
      row({ id: "c", module: "leiloes", created_at: "2026-08-04T01:00:00Z" }),
    ];
    const heat = buildHeatmap(rows, "modulo", "dia", 7, NOW);
    expect(heat.cols).toHaveLength(7);
    expect(heat.rows[0]).toBe("fretes"); // mais volumoso primeiro
    expect(heat.cells["fretes"]["2026-08-05"]).toBe(2);
    expect(heat.max).toBe(2);
  });

  it("agrupa por responsável usando — para não atribuídos", () => {
    const heat = buildHeatmap([row({ id: "a", created_at: "2026-08-05T01:00:00Z" })], "responsavel", "dia", 3, NOW);
    expect(heat.rows).toContain("—");
  });
});

describe("formatDurationMs", () => {
  it("formata minutos, horas e dias", () => {
    expect(formatDurationMs(30 * 60_000)).toBe("30 min");
    expect(formatDurationMs(5 * HOUR)).toBe("5.0 h");
    expect(formatDurationMs(72 * HOUR)).toBe("3.0 dias");
    expect(formatDurationMs(null)).toBe("—");
  });
});
