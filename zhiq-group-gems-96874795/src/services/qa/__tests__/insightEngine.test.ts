import { describe, it, expect } from "vitest";
import { analyzeIssue, type QaInsightInput } from "../insightEngine";

function input(overrides: Partial<QaInsightInput> = {}): QaInsightInput {
  return {
    title: "Falha genérica",
    description: null,
    module: "geral",
    origin: "manual",
    environment: "homologacao",
    severity: "medio",
    error_message: null,
    stack_trace: null,
    reopen_count: 0,
    history_count: 1,
    ...overrides,
  };
}

describe("analyzeIssue (Análise Inteligente — causa raiz por regras)", () => {
  it("detecta bloqueio de RLS a partir da mensagem de erro", () => {
    const insight = analyzeIssue(input({ error_message: "permission denied for table qa_issues (42501)" }));
    expect(insight.probableCause).toMatch(/RLS|permiss/i);
  });

  it("detecta divergência de schema (migration não aplicada)", () => {
    const insight = analyzeIssue(input({ error_message: 'column "foo" does not exist' }));
    expect(insight.probableCause).toMatch(/schema|migration/i);
  });

  it("usa fallback da origem quando nenhum padrão casa", () => {
    const insight = analyzeIssue(input({ origin: "deploy" }));
    expect(insight.probableCause).toMatch(/deploy/i);
  });

  it("crítico em produção = risco Crítico e impacto de incidente", () => {
    const insight = analyzeIssue(input({ severity: "critico", environment: "producao" }));
    expect(insight.risk).toBe("Crítico");
    expect(insight.estimatedImpact).toMatch(/produção/i);
  });

  it("reaberturas e stack elevam a complexidade (e o tempo estimado acompanha)", () => {
    const simples = analyzeIssue(input());
    const complexo = analyzeIssue(input({
      reopen_count: 2,
      history_count: 15,
      stack_trace: "at db.query (supabase.ts:42)",
      origin: "banco",
      severity: "critico",
    }));
    expect(simples.complexity).toBe("Baixa");
    expect(complexo.complexity).toBe("Alta");
    expect(complexo.estimatedFixTime).not.toBe(simples.estimatedFixTime);
  });

  it("área afetada combina camada (origem) e módulo", () => {
    const insight = analyzeIssue(input({ origin: "supabase", module: "leiloes" }));
    expect(insight.affectedArea).toContain("leiloes");
    expect(insight.affectedArea).toMatch(/Dados/);
  });
});
