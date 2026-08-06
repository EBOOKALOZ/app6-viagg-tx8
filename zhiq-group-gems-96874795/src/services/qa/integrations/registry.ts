/**
 * ORION-QA Fase 3 — registro plugável de integrações.
 *
 * Cada integração se declara aqui (fonte, rótulo, capacidades e status).
 * O painel de Observabilidade lista o registro; conectar um serviço externo
 * no futuro é registrar uma integração com status "ativa" — nenhum outro
 * ponto do sistema precisa mudar (arquitetura desacoplada).
 */
import type { QaEventSource } from "../events/types";

export type QaIntegrationStatus = "ativa" | "preparada";

export interface QaIntegrationDefinition {
  source: QaEventSource;
  label: string;
  version: string;
  /** "ativa" = já emite eventos reais; "preparada" = contrato pronto, aguarda conexão externa. */
  status: QaIntegrationStatus;
  /** O que a integração registra (exibido no painel). */
  captures: string[];
}

class QaIntegrationRegistry {
  private readonly definitions = new Map<QaEventSource, QaIntegrationDefinition>();

  register(definition: QaIntegrationDefinition): void {
    this.definitions.set(definition.source, definition);
  }

  get(source: QaEventSource): QaIntegrationDefinition | undefined {
    return this.definitions.get(source);
  }

  list(): QaIntegrationDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }
}

export const qaIntegrations = new QaIntegrationRegistry();
