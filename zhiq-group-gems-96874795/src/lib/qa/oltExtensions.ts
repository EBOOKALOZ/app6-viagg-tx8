/**
 * ORION LOCAL TEST LAB v2.0 — pontos de extensão da Auditoria Contínua.
 *
 * Contratos previstos para as evoluções futuras: agendamento de homologações,
 * comparação automática entre versões, histórico ilimitado, métricas ao longo
 * do tempo, integração com o SHC, bloqueio automático por falhas críticas e
 * geração automática de relatórios.
 *
 * NENHUMA dessas funcionalidades é implementada aqui — apenas as interfaces e
 * o registro tipado que o painel já consulta. Registrar uma implementação no
 * `oltExtensions` é suficiente para o painel passar a usá-la, sem alterar a
 * arquitetura, as rotas ou o RBAC existentes.
 */
import type { DefCategoria, ExecucaoOLT } from "./oltTypes";
import type { GruposDeFalhas } from "./oltReport";

/** Persistência do histórico. O padrão (localStorage, 20 execuções) vive em oltHistory.ts. */
export interface OltHistoricoAdapter {
  listar(): ExecucaoOLT[];
  /** Salva e devolve a lista atualizada, já aplicando o limite de retenção. */
  salvar(execucao: ExecucaoOLT): ExecucaoOLT[];
  /** Limite de retenção; null = histórico ilimitado (extensão futura). */
  limite: number | null;
}

/** Agendamento de homologações recorrentes (extensão futura). */
export interface OltAgendamentoProvider {
  agendar(expressaoCron: string, executar: () => Promise<void>): { cancelar(): void };
  proximaExecucao(): string | null;
}

/** Comparação automática entre versões do sistema (extensão futura). */
export interface OltComparadorVersoes {
  compararComVersaoAnterior(execucao: ExecucaoOLT, historico: ExecucaoOLT[]): unknown;
}

/** Métricas ao longo do tempo (extensão futura). */
export interface OltMetricasTemporais {
  registrar(execucao: ExecucaoOLT): void;
  serie(
    metrica: "duracaoMs" | "pass" | "fail",
    janelaDias: number
  ): Array<{ ts: string; valor: number }>;
}

/**
 * Gate de homologação: pode bloquear quando houver falhas críticas.
 * O motor da fila já chama `avaliar` ao final de cada execução — com o
 * registro em null, nada acontece (comportamento atual preservado).
 */
export interface OltGateHomologacao {
  avaliar(
    execucao: ExecucaoOLT,
    grupos: GruposDeFalhas
  ): { bloqueado: boolean; motivo?: string };
}

/** Publicação do resultado no SHC server-side (extensão futura). */
export interface OltShcBridge {
  publicar(execucao: ExecucaoOLT, definicao: DefCategoria[]): Promise<void>;
}

/** Geração automática de relatórios ao término de cada homologação (extensão futura). */
export interface OltRelatorioAutomatico {
  gerar(execucao: ExecucaoOLT, definicao: DefCategoria[]): Promise<void>;
}

export interface OltExtensionRegistry {
  historico: OltHistoricoAdapter | null;
  agendamento: OltAgendamentoProvider | null;
  comparadorVersoes: OltComparadorVersoes | null;
  metricas: OltMetricasTemporais | null;
  gate: OltGateHomologacao | null;
  shc: OltShcBridge | null;
  relatorioAutomatico: OltRelatorioAutomatico | null;
}

/** Registro consultado pelo painel. Tudo null = comportamento atual inalterado. */
export const oltExtensions: OltExtensionRegistry = {
  historico: null,
  agendamento: null,
  comparadorVersoes: null,
  metricas: null,
  gate: null,
  shc: null,
  relatorioAutomatico: null,
};
