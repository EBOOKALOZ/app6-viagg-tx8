/**
 * Máquina de estados do módulo Doações & Convênios — fonte única no frontend.
 * Espelha exatamente os triggers `convenio_enforce_status_transition` do banco
 * (migration 20260805_convenio_p2_p3_status_stats.sql): o banco é a autoridade
 * (fail-closed); aqui a mesma regra alimenta a UI (opções visíveis) e os
 * services (erro amigável antes do roundtrip).
 *
 * Regras centrais da auditoria: nenhum registro pula etapas
 * (rascunho → encerrado é inválido) nem ressuscita (encerrado → ativo é
 * inválido). Estados sem saída são terminais.
 */
import type {
  ConvenioAccountabilityStatus,
  ConvenioAgreementStatus,
  ConvenioCampaignStatus,
  ConvenioDonationStatus,
  ConvenioEntityStatus,
} from "@/services/convenio/types";

export const AGREEMENT_TRANSITIONS: Record<ConvenioAgreementStatus, ConvenioAgreementStatus[]> = {
  rascunho: ["em_aprovacao"],
  em_aprovacao: ["ativo", "rascunho"],
  ativo: ["suspenso", "encerrado"],
  suspenso: ["ativo", "encerrado"],
  encerrado: [],
};

export const CAMPAIGN_TRANSITIONS: Record<ConvenioCampaignStatus, ConvenioCampaignStatus[]> = {
  planejada: ["ativa"],
  ativa: ["pausada", "encerrada"],
  pausada: ["ativa", "encerrada"],
  encerrada: [],
};

// "estornada" a partir de "registrada" cobre o cancelamento de um registro
// manual equivocado (nunca confirmado); a partir de "confirmada" é o estorno
// financeiro de fato. Estornada é terminal.
export const DONATION_TRANSITIONS: Record<ConvenioDonationStatus, ConvenioDonationStatus[]> = {
  registrada: ["confirmada", "estornada"],
  confirmada: ["estornada"],
  estornada: [],
};

export const ACCOUNTABILITY_TRANSITIONS: Record<ConvenioAccountabilityStatus, ConvenioAccountabilityStatus[]> = {
  rascunho: ["publicada"],
  publicada: ["arquivada"],
  arquivada: [],
};

export const ENTITY_TRANSITIONS: Record<ConvenioEntityStatus, ConvenioEntityStatus[]> = {
  em_analise: ["ativo", "reprovado"],
  ativo: ["suspenso", "encerrado"],
  suspenso: ["ativo", "encerrado"],
  reprovado: ["em_analise"],
  encerrado: [],
};

export type ConvenioStatusDomain = "agreement" | "campaign" | "donation" | "accountability" | "entity";

const TRANSITIONS: Record<ConvenioStatusDomain, Record<string, string[]>> = {
  agreement: AGREEMENT_TRANSITIONS,
  campaign: CAMPAIGN_TRANSITIONS,
  donation: DONATION_TRANSITIONS,
  accountability: ACCOUNTABILITY_TRANSITIONS,
  entity: ENTITY_TRANSITIONS,
};

export function allowedNextStatuses(domain: ConvenioStatusDomain, current: string): string[] {
  return TRANSITIONS[domain][current] ?? [];
}

export function isTransitionAllowed(domain: ConvenioStatusDomain, from: string, to: string): boolean {
  if (from === to) return true; // no-op (edição de outros campos) nunca bloqueia
  return allowedNextStatuses(domain, from).includes(to);
}

export function assertStatusTransition(domain: ConvenioStatusDomain, from: string, to: string): void {
  if (!isTransitionAllowed(domain, from, to)) {
    throw new Error(`Transição de status inválida: "${from}" → "${to}" não é permitida.`);
  }
}
