import { describe, it, expect } from "vitest";
import { computePriorityScore, levelForScore, type QaPriorityInput } from "../priorityScore";

const NOW = new Date("2026-08-05T12:00:00Z");

function input(overrides: Partial<QaPriorityInput> = {}): QaPriorityInput {
  return {
    severity: "medio",
    environment: "homologacao",
    status: "novo",
    module: "geral",
    created_at: "2026-08-05T10:00:00Z",
    comments_count: 0,
    history_count: 1,
    attachments_count: 0,
    reopen_count: 0,
    ...overrides,
  };
}

describe("computePriorityScore (motor de Prioridade IA)", () => {
  it("retorna score no intervalo 0–100 com nível e composição", () => {
    const result = computePriorityScore(input(), NOW);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown.length).toBeGreaterThan(0);
    expect(result.label.length).toBeGreaterThan(0);
  });

  it("crítico antigo em produção reaberto atinge nível Crítica", () => {
    const result = computePriorityScore(
      input({
        severity: "critico",
        environment: "producao",
        status: "reaberto",
        module: "pagamentos",
        created_at: "2026-06-01T00:00:00Z",
        comments_count: 6,
        history_count: 12,
        attachments_count: 3,
        reopen_count: 2,
      }),
      NOW,
    );
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.level).toBe("critica");
  });

  it("melhoria recente em ambiente local fica com nível Baixa", () => {
    const result = computePriorityScore(
      input({ severity: "melhoria", environment: "local", status: "novo" }),
      NOW,
    );
    expect(result.level).toBe("baixa");
  });

  it("problema fechado tem score amortecido (menor que o equivalente aberto)", () => {
    const aberto = computePriorityScore(input({ severity: "critico", environment: "producao" }), NOW);
    const fechado = computePriorityScore(
      input({ severity: "critico", environment: "producao", status: "fechado" }),
      NOW,
    );
    expect(fechado.score).toBeLessThan(aberto.score);
  });

  it("score cresce monotonicamente com severidade", () => {
    const ordem = ["melhoria", "baixo", "medio", "alto", "critico"];
    const scores = ordem.map((s) => computePriorityScore(input({ severity: s }), NOW).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
  });

  it("levelForScore respeita os cortes 40/65/85", () => {
    expect(levelForScore(39)).toBe("baixa");
    expect(levelForScore(40)).toBe("moderada");
    expect(levelForScore(64)).toBe("moderada");
    expect(levelForScore(65)).toBe("alta");
    expect(levelForScore(84)).toBe("alta");
    expect(levelForScore(85)).toBe("critica");
  });
});
