/**
 * P3 — Máquina de estados do módulo Doações & Convênios.
 * Valida as regras centrais da auditoria: sem saltos (rascunho → encerrado)
 * e sem ressurreição (encerrado → ativo); estorno de doações segue
 * registrada → confirmada → estornada com estornada terminal.
 */
import { describe, expect, it } from "vitest";
import { allowedNextStatuses, assertStatusTransition, isTransitionAllowed } from "../statusTransitions";

describe("convênios (agreements)", () => {
  it("segue o fluxo rascunho → em_aprovacao → ativo → suspenso/encerrado", () => {
    expect(isTransitionAllowed("agreement", "rascunho", "em_aprovacao")).toBe(true);
    expect(isTransitionAllowed("agreement", "em_aprovacao", "ativo")).toBe(true);
    expect(isTransitionAllowed("agreement", "ativo", "suspenso")).toBe(true);
    expect(isTransitionAllowed("agreement", "suspenso", "ativo")).toBe(true);
    expect(isTransitionAllowed("agreement", "ativo", "encerrado")).toBe(true);
  });

  it("bloqueia rascunho → encerrado (exemplo explícito da auditoria)", () => {
    expect(isTransitionAllowed("agreement", "rascunho", "encerrado")).toBe(false);
    expect(() => assertStatusTransition("agreement", "rascunho", "encerrado")).toThrow(/inválida/);
  });

  it("bloqueia encerrado → ativo (terminal, exemplo explícito da auditoria)", () => {
    expect(allowedNextStatuses("agreement", "encerrado")).toEqual([]);
    expect(isTransitionAllowed("agreement", "encerrado", "ativo")).toBe(false);
  });
});

describe("campanhas", () => {
  it("planejada só ativa; ativa pausa/encerra; encerrada é terminal", () => {
    expect(allowedNextStatuses("campaign", "planejada")).toEqual(["ativa"]);
    expect(isTransitionAllowed("campaign", "ativa", "pausada")).toBe(true);
    expect(isTransitionAllowed("campaign", "pausada", "ativa")).toBe(true);
    expect(isTransitionAllowed("campaign", "planejada", "encerrada")).toBe(false);
    expect(allowedNextStatuses("campaign", "encerrada")).toEqual([]);
  });
});

describe("doações (estorno — P2)", () => {
  it("registrada confirma ou estorna; confirmada só estorna; estornada é terminal", () => {
    expect(allowedNextStatuses("donation", "registrada")).toEqual(["confirmada", "estornada"]);
    expect(allowedNextStatuses("donation", "confirmada")).toEqual(["estornada"]);
    expect(allowedNextStatuses("donation", "estornada")).toEqual([]);
    expect(isTransitionAllowed("donation", "estornada", "confirmada")).toBe(false);
  });
});

describe("prestação de contas", () => {
  it("rascunho publica; publicada arquiva; rascunho NÃO arquiva direto", () => {
    expect(isTransitionAllowed("accountability", "rascunho", "publicada")).toBe(true);
    expect(isTransitionAllowed("accountability", "publicada", "arquivada")).toBe(true);
    expect(isTransitionAllowed("accountability", "rascunho", "arquivada")).toBe(false);
    expect(allowedNextStatuses("accountability", "arquivada")).toEqual([]);
  });
});

describe("credenciamento (entities)", () => {
  it("em_analise aprova/reprova; reprovado volta para análise; encerrado é terminal", () => {
    expect(allowedNextStatuses("entity", "em_analise")).toEqual(["ativo", "reprovado"]);
    expect(isTransitionAllowed("entity", "reprovado", "em_analise")).toBe(true);
    expect(isTransitionAllowed("entity", "em_analise", "encerrado")).toBe(false);
    expect(allowedNextStatuses("entity", "encerrado")).toEqual([]);
  });
});

describe("regras gerais", () => {
  it("no-op (mesmo status) nunca bloqueia — edições de outros campos passam", () => {
    expect(isTransitionAllowed("agreement", "encerrado", "encerrado")).toBe(true);
    expect(isTransitionAllowed("donation", "estornada", "estornada")).toBe(true);
  });

  it("status desconhecido não tem transições (fail-closed)", () => {
    expect(allowedNextStatuses("agreement", "inexistente")).toEqual([]);
    expect(isTransitionAllowed("agreement", "inexistente", "ativo")).toBe(false);
  });
});
