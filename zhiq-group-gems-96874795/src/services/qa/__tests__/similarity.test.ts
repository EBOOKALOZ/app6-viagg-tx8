import { describe, it, expect } from "vitest";
import { computeSimilarity, findRelated, tokenize, type QaSimilarityInput } from "../similarity";

function issue(overrides: Partial<QaSimilarityInput> = {}): QaSimilarityInput {
  return {
    id: "a",
    title: "Erro ao salvar produto no marketplace",
    description: "Falha ao clicar em salvar produto",
    module: "marketplace",
    error_message: "permission denied for table products",
    commit_hash: null,
    stack_trace: null,
    status: "novo",
    ...overrides,
  };
}

describe("tokenize", () => {
  it("remove stopwords, acentos e tokens curtos", () => {
    const tokens = tokenize("O erro de conexão não salva o débito");
    expect(tokens.has("erro")).toBe(false);   // stopword do domínio
    expect(tokens.has("conexao")).toBe(true); // acento normalizado
    expect(tokens.has("de")).toBe(false);     // stopword/curto
    expect(tokens.has("debito")).toBe(true);
  });
});

describe("computeSimilarity (Problemas Relacionados)", () => {
  it("problema idêntico tem similaridade alta (>70%)", () => {
    const base = issue();
    const clone = issue({ id: "b" });
    expect(computeSimilarity(base, clone)).toBeGreaterThan(70);
  });

  it("problemas sem nenhuma relação ficam abaixo do corte de 20%", () => {
    const base = issue();
    const other = issue({
      id: "b",
      title: "Timeout na geracao do boleto bancario",
      description: "Cliente aguarda demais na fatura",
      module: "financeiro",
      error_message: "statement timeout exceeded",
      status: "fechado",
    });
    expect(computeSimilarity(base, other)).toBeLessThan(20);
  });

  it("mesmo commit e mesmo módulo elevam a similaridade", () => {
    const base = issue({ commit_hash: "abc1234" });
    const semSinais = issue({ id: "b", module: "fretes", commit_hash: null });
    const comSinais = issue({ id: "c", commit_hash: "abc1234" });
    expect(computeSimilarity(base, comSinais)).toBeGreaterThan(computeSimilarity(base, semSinais));
  });
});

describe("findRelated", () => {
  it("exclui o próprio problema, ordena por similaridade e aplica corte", () => {
    const base = issue();
    const candidates = [
      base,
      issue({ id: "b" }),                                     // quase idêntico
      issue({ id: "c", title: "Erro salvar produto", description: null, error_message: null }),
      issue({ id: "d", title: "Relatorio mensal indisponivel", description: "outro assunto", module: "relatorios", error_message: null }),
    ];
    const related = findRelated(base, candidates, 5, 20);
    expect(related.find((r) => r.id === "a")).toBeUndefined();
    expect(related[0]?.id).toBe("b");
    for (let i = 1; i < related.length; i++) {
      expect(related[i - 1].similarity).toBeGreaterThanOrEqual(related[i].similarity);
    }
    for (const r of related) expect(r.similarity).toBeGreaterThanOrEqual(20);
  });
});
