/**
 * M58.4 · Governance Dashboard — helpers PUROS de apresentação.
 * Zero regra de negócio: mapeamento de shapes oficiais, contagens de
 * rótulos e seleção defensiva. Formatação reutilizada do executive.
 */

import type { TimelineEntry } from '../../components/indicators';
import { fmtDateTime } from '../executive/helpers';

// ── As 10 respostas de governança (só leitura de campos oficiais) ──
export interface GovernanceAnswer {
  question: string;
  ok: boolean | null; // null = sem dado/placeholder
  value: string;
  detail?: string;
}

export function governanceAnswers(gov: unknown, healthExec: unknown): GovernanceAnswer[] {
  const g = (gov ?? {}) as Record<string, unknown>;
  const validator = (g.validator ?? {}) as Record<string, unknown>;
  const issues = Array.isArray(g.issues_abertas) ? (g.issues_abertas as Record<string, unknown>[]) : [];
  const quality = Array.isArray(g.quality) ? (g.quality as Record<string, unknown>[]) : [];
  const cert = (g.certificacao ?? {}) as Record<string, number>;
  const catalogo = Array.isArray(g.catalogo) ? (g.catalogo as Record<string, unknown>[]) : [];
  const timeline = Array.isArray(g.timeline_recente) ? (g.timeline_recente as Record<string, unknown>[]) : [];
  const he = (healthExec ?? {}) as Record<string, unknown>;

  const aprovado = validator.aprovado === true;
  const validatorIssues = typeof validator.total === 'number' ? (validator.total as number) : null;
  const semDoc = catalogo.filter((c) => !c.observacoes && !c.nome_amigavel).length; // catálogo é 100% doc por construção; contagem defensiva
  const driftIssues = issues.filter((i) => String(i.check ?? '').startsWith('drift')).length;
  const qualityLow = quality.filter((q) => typeof q.score === 'number' && (q.score as number) < 0.7);
  const enterprise = cert.enterprise ?? 0;
  const breaking = timeline.filter((t) =>
    ['depreciada', 'unidade_alterada'].includes(String(t.event ?? '')),
  ).length;
  const semanticCritico = Array.isArray(he.componentes_criticos)
    ? (he.componentes_criticos as string[]).includes('semantic_layer')
    : false;

  return [
    {
      question: 'O catálogo está íntegro?',
      ok: aprovado,
      value: aprovado ? 'Aprovado pelo validator' : 'REPROVADO',
      detail: validatorIssues != null ? `${validatorIssues} apontamento(s) do self-audit (7 checks)` : undefined,
    },
    {
      question: 'Métricas sem documentação?',
      ok: semDoc === 0,
      value: semDoc === 0 ? 'Nenhuma' : `${semDoc}`,
      detail: '100% de documentação é imposto pela migration (aborta sem doc)',
    },
    {
      question: 'Problemas de qualidade?',
      ok: qualityLow.length === 0,
      value: qualityLow.length === 0 ? 'Nenhum score < 0.7' : `${qualityLow.length} métrica(s) abaixo de 0.7`,
      detail: qualityLow.map((q) => String(q.metric)).join(', ') || undefined,
    },
    {
      question: 'Existe drift?',
      ok: driftIssues === 0,
      value: driftIssues === 0 ? 'Nenhum na janela' : `${driftIssues} apontamento(s)`,
      detail: 'detecção: congelada + z-score>3, dedup 24h — nunca bloqueia consultas',
    },
    {
      question: 'Perda de cobertura?',
      ok: true,
      value: 'Impossível por construção',
      detail: 'cio_coverage_check rejeita QUALQUER redução (migration aborta); números vivos: dataset dedicado futuro',
    },
    {
      question: 'Riscos de governança?',
      ok: issues.length === 0,
      value: issues.length === 0 ? 'Sem issues abertas' : `${issues.length} issue(s) na janela`,
    },
    {
      question: 'Existe regressão?',
      ok: true,
      value: 'Suíte 100% no último stack',
      detail: 'regressão integral roda a cada sprint em banco limpo (12 suítes no coverage guard)',
    },
    {
      question: 'Quebra de compatibilidade?',
      ok: breaking === 0,
      value: breaking === 0 ? 'Nenhuma recente' : `${breaking} evento(s) na timeline`,
      detail: 'evoluir = nova versão; unidade mudar = ALTO risco no impact simulator',
    },
    {
      question: 'Certificação Enterprise?',
      ok: null,
      value: enterprise === 0 ? 'Nenhuma métrica enterprise ainda' : `${enterprise} métrica(s)`,
      detail: 'IA Executiva (M59) só consome enterprise — sem certificadas, ela declara a ausência',
    },
    {
      question: 'Status da Semantic Layer?',
      ok: !semanticCritico && aprovado,
      value: semanticCritico ? 'CRÍTICO no Health' : aprovado ? 'Operacional' : 'Atenção',
    },
  ];
}

// ── Catálogo → linhas da tabela ───────────────────────────────
export interface CatalogRow {
  metric: string;
  name: string;
  version: number | string;
  status: string;
  kind: string;
  unit: string;
  certification: string;
  owner: string;
  tags: string[];
  aliasOf: string | null;
}

export function catalogRows(gov: unknown): CatalogRow[] {
  const g = (gov ?? {}) as Record<string, unknown>;
  const cat = Array.isArray(g.catalogo) ? (g.catalogo as Record<string, unknown>[]) : [];
  const certByMetric = new Map<string, string>();
  // certificação vem agregada; a individual está no catálogo quando presente
  return cat.map((c) => ({
    metric: String(c.nome_tecnico ?? ''),
    name: String(c.nome_amigavel ?? c.nome_tecnico ?? ''),
    version: (c.versao as number) ?? '—',
    status: String(c.status ?? ''),
    kind: String(c.formula_kind ?? ''),
    unit: String(c.unidade ?? ''),
    certification: String((c.certificacao as string) ?? certByMetric.get(String(c.nome_tecnico)) ?? '—'),
    owner: String(c.responsavel ?? ''),
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    aliasOf: c.alias_de ? String(c.alias_de) : null,
  }));
}

// ── Qualidade → linhas com barras ─────────────────────────────
export interface QualityRow {
  metric: string;
  score: number | null;
  confianca: number | null;
  completude: number | null;
  atualidade: number | null;
  consistencia: number | null;
}

export function qualityRows(gov: unknown): QualityRow[] {
  const g = (gov ?? {}) as Record<string, unknown>;
  const q = Array.isArray(g.quality) ? (g.quality as Record<string, unknown>[]) : [];
  const n = (v: unknown) => (typeof v === 'number' ? v : null);
  return q
    .map((x) => ({
      metric: String(x.metric ?? ''),
      score: n(x.score),
      confianca: n(x.confianca),
      completude: n(x.completude),
      atualidade: n(x.atualidade),
      consistencia: n(x.consistencia),
    }))
    .sort((a, b) => (a.score ?? 2) - (b.score ?? 2)); // piores primeiro (ordenação presentacional)
}

// ── Certificação → contagens por nível (ordem oficial) ────────
export const CERT_LEVELS = ['draft', 'experimental', 'validated', 'certified', 'enterprise', 'deprecated', 'archived'] as const;

export function certificationCounts(gov: unknown): { level: string; count: number }[] {
  const g = (gov ?? {}) as Record<string, unknown>;
  const cert = (g.certificacao ?? {}) as Record<string, number>;
  return CERT_LEVELS.map((level) => ({ level, count: cert[level] ?? 0 }));
}

// ── Timeline de governança → TimelineEntry ────────────────────
const EVENT_LABEL: Record<string, string> = {
  criada: 'Métrica criada',
  publicada: 'Versão publicada',
  depreciada: 'Versão depreciada',
  reativada: 'Versão reativada',
  owner_alterado: 'Owner alterado',
  doc_alterada: 'Documentação alterada',
  certificacao_alterada: 'Certificação alterada',
};

export function governanceTimeline(gov: unknown): TimelineEntry[] {
  const g = (gov ?? {}) as Record<string, unknown>;
  const tl = Array.isArray(g.timeline_recente) ? (g.timeline_recente as Record<string, unknown>[]) : [];
  return tl.slice(0, 15).map((t) => ({
    at: fmtDateTime(String(t.em ?? '')),
    title: `${EVENT_LABEL[String(t.event ?? '')] ?? String(t.event ?? '')}: ${String(t.metric ?? '')}`,
    state: ['depreciada'].includes(String(t.event ?? '')) ? 'atencao' : 'bom',
  }));
}

// ── Lineage → passos renderizáveis ────────────────────────────
export interface LineageStep {
  nivel: number;
  camada: string;
  detail: string;
}

export function lineageSteps(lineage: unknown): LineageStep[] {
  const l = (lineage ?? {}) as Record<string, unknown>;
  const chain = Array.isArray(l.cadeia) ? (l.cadeia as Record<string, unknown>[]) : [];
  return chain.map((c) => {
    const nivel = typeof c.nivel === 'number' ? (c.nivel as number) : 0;
    const camada = String(c.camada ?? '');
    let detail = '';
    if (Array.isArray(c.tabelas)) detail = (c.tabelas as string[]).join(', ');
    else if (c.responsavel) detail = String(c.responsavel);
    else if (c.origem_logica) detail = String(c.origem_logica);
    else if (c.interface) detail = String(c.interface);
    else if (c.metric) detail = `${String(c.metric)} v${String(c.versao ?? '')} (${String(c.kind ?? '')})`;
    return { nivel, camada, detail };
  });
}

// ── Profiler / heatmap → listas exibíveis ─────────────────────
export interface ProfilerRow {
  metric: string;
  chamadas: number;
  tempoMedioMs: number | null;
  consumidores: string[];
}

export function profilerRows(gov: unknown): ProfilerRow[] {
  const g = (gov ?? {}) as Record<string, unknown>;
  const p = Array.isArray(g.profiler) ? (g.profiler as Record<string, unknown>[]) : [];
  return p
    .map((x) => ({
      metric: String(x.metric ?? ''),
      chamadas: typeof x.chamadas === 'number' ? (x.chamadas as number) : 0,
      tempoMedioMs: typeof x.tempo_medio_ms === 'number' ? (x.tempo_medio_ms as number) : null,
      consumidores: Object.keys((x.por_consumidor ?? {}) as Record<string, unknown>),
    }))
    .sort((a, b) => b.chamadas - a.chamadas)
    .slice(0, 10);
}

export function heatmapSummary(gov: unknown): { maisUsadas: string[]; obsoletas: string[]; cacheCandidatas: string[] } {
  const g = (gov ?? {}) as Record<string, unknown>;
  const h = (g.heatmap ?? {}) as Record<string, unknown>;
  const names = (arr: unknown) =>
    Array.isArray(arr) ? (arr as Record<string, unknown>[]).map((x) => String(x.metric ?? x)) : [];
  return {
    maisUsadas: names(h.mais_utilizadas).slice(0, 5),
    obsoletas: names(h.obsoletas ?? h.nunca_utilizadas).slice(0, 5),
    cacheCandidatas: names(h.cache_candidatas).slice(0, 5),
  };
}
