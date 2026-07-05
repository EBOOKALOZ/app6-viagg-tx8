/**
 * M59.1 · Enterprise Narrative Engine — CONTRATOS DEFINITIVOS.
 *
 * Todo o Programa M59 consome exclusivamente o NarrativeInput daqui.
 * Cada informação carrega NarrativeEvidence (origem/dataset/timestamp/
 * confiança/disponibilidade/versão) — rastreabilidade integral.
 * Nenhum texto em linguagem natural nasce nesta camada.
 */

// ── Estados oficiais (spec M59.1) — SEMPRE declarados, nunca ocultados ──
export type NarrativeAvailability =
  | 'ok'
  | 'carregando'
  | 'sem_dados'
  | 'incompleto'
  | 'aguardando_fonte'
  | 'offline'
  | 'erro';

/** Confiança da informação — só existem 3 origens possíveis. */
export type NarrativeConfidence =
  | 'oficial'                    // campo lido literalmente de dataset oficial
  | 'contagem_presentacional'    // contagem/seleção de registros oficiais (sem aritmética de negócio)
  | 'indisponivel';

/** Evidência: TODO valor do contexto narrativo carrega uma. */
export interface NarrativeEvidence<T = unknown> {
  value: T | null;
  /** chave do Dataset Registry de onde o valor veio */
  dataset: string;
  /** campo/bloco de origem dentro do dataset */
  component: string;
  /** quando o dataset foi atualizado (updatedAt do useDataset) */
  timestamp: string | null;
  confidence: NarrativeConfidence;
  availability: NarrativeAvailability;
  /** versão da fonte quando existir (ex.: versão da métrica) */
  version: string | number | null;
}

// ── Seções do contexto (ordem oficial do Builder) ─────────────
export interface SecaoSituacaoGeral {
  situacao: NarrativeEvidence<string>;
  scoreGeral: NarrativeEvidence<number>;
  tendenciaOperacional: NarrativeEvidence<string>;
}

export interface SecaoHealth {
  componentesCriticos: NarrativeEvidence<string[]>;
  componentesOffline: NarrativeEvidence<string[]>;
  saudaveis: NarrativeEvidence<number>;
  degradados: NarrativeEvidence<number>;
}

export interface SecaoAlertas {
  ativos: NarrativeEvidence<number>;
  criticos: NarrativeEvidence<number>;
  maioresRiscos: NarrativeEvidence<{ regra: string; severidade: string }[]>;
  avisosAntecipados: NarrativeEvidence<string[]>;
}

export interface SecaoGovernanca {
  catalogoAprovado: NarrativeEvidence<boolean>;
  metricasEnterprise: NarrativeEvidence<number>;
  metricasAtivas: NarrativeEvidence<number>;
}

export interface SecaoIncidentes {
  ativos: NarrativeEvidence<number>;
  ultimos: NarrativeEvidence<{ componente: string; status: string; inicio: string }[]>;
}

export interface SecaoTimeline {
  eventosRecentes: NarrativeEvidence<{ em: string; titulo: string }[]>;
}

export interface SecaoQuality {
  metricasAbaixoDe07: NarrativeEvidence<string[]>;
}

export interface SecaoIssues {
  abertas: NarrativeEvidence<number>;
  drift: NarrativeEvidence<number>;
}

export interface SecaoExecutiveSummary {
  disponibilidadeComponentesChave: NarrativeEvidence<Record<string, number | null>>;
}

/** M59.3 (aditivo): filas operacionais — base de gargalos do Operations Narrator. */
export interface SecaoFilas {
  backlogPublicacao: NarrativeEvidence<number>;
  lotesDisponiveis: NarrativeEvidence<number>;
}

/** M59.4 (aditivo): séries históricas oficiais — base do Predictive Narrator.
 *  Vêm de datasets JÁ consumidos (operational.timeline_24h e
 *  alert-dashboard.tendencia_14d) — nenhum dataset novo. */
export interface SecaoSeries {
  healthTimeline: NarrativeEvidence<{ component: string; em: string; score: number }[]>;
  alertas14d: NarrativeEvidence<{ dia: string; alertas: number }[]>;
}

export const NARRATIVE_SECTION_ORDER = [
  'situacaoGeral', 'health', 'alertas', 'governanca', 'incidentes',
  'timeline', 'quality', 'issues', 'executiveSummary', 'filas', 'series',
] as const;
export type NarrativeSectionKey = (typeof NARRATIVE_SECTION_ORDER)[number];

// ── O CONTRATO — único formato permitido no Programa M59 ──────
export interface NarrativeInput {
  meta: {
    engineVersion: 'M59.1';
    geradoEm: string;
    /** true somente se TODAS as seções estiverem 'ok' */
    completo: boolean;
    /** estado declarado de cada seção — ausência jamais é ocultada */
    estados: Record<NarrativeSectionKey, NarrativeAvailability>;
    /** duração da montagem do contexto (benchmark; alvo < 200ms) */
    montagemMs: number | null;
  };
  situacaoGeral: SecaoSituacaoGeral;
  health: SecaoHealth;
  alertas: SecaoAlertas;
  governanca: SecaoGovernanca;
  incidentes: SecaoIncidentes;
  timeline: SecaoTimeline;
  quality: SecaoQuality;
  issues: SecaoIssues;
  executiveSummary: SecaoExecutiveSummary;
  filas: SecaoFilas;
  series: SecaoSeries;
}

// ── Validação: contexto inconsistente JAMAIS passa silencioso ──
export interface NarrativeProblem {
  secao: NarrativeSectionKey;
  campo: string;
  tipo: Exclude<NarrativeAvailability, 'ok'>;
  detalhe: string;
}

export interface NarrativeValidation {
  valido: boolean;               // true = todas as seções utilizáveis (ok)
  utilizavelComRessalvas: boolean; // true = nenhuma seção em erro/carregando
  problemas: NarrativeProblem[];
}

// ── Fontes cruas que o Builder recebe (payloads oficiais + meta) ──
export interface RawSource {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  updatedAt: number | null;
}

export interface NarrativeRawSources {
  healthExecutive: RawSource;
  alertExecutive: RawSource;
  alertDashboard: RawSource;
  operational: RawSource;
  governance: RawSource;
  /** M59.3: fila operacional (semáforo do NOC) */
  noc: RawSource;
}

/** Datasets oficiais exigidos pelo engine — ÚNICOS; sem builder paralelo. */
export const NARRATIVE_REQUIRED_DATASETS = [
  'health-executive', 'alert-executive', 'alert-dashboard', 'operational', 'governance', 'noc',
] as const;
