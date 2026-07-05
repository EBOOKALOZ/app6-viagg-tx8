/**
 * M59.1 · NarrativeContextBuilder — consolida os datasets oficiais no
 * NarrativeInput. 100% PURO e determinístico (testável sem React/rede).
 * Nada é calculado: campos são lidos literalmente; onde há contagem, é
 * contagem presentacional de registros oficiais, marcada como tal.
 */

import {
  type NarrativeInput, type NarrativeEvidence, type NarrativeAvailability,
  type NarrativeRawSources, type RawSource, type NarrativeSectionKey,
  NARRATIVE_SECTION_ORDER,
} from './types';

// ── fábrica de evidência (auditoria embutida) ─────────────────
function evidence<T>(
  src: RawSource,
  dataset: string,
  component: string,
  value: T | null,
  opts?: {
    confidence?: NarrativeEvidence['confidence'];
    availability?: NarrativeAvailability;
    version?: string | number | null;
  },
): NarrativeEvidence<T> {
  const availability: NarrativeAvailability =
    opts?.availability ??
    (src.isLoading ? 'carregando'
      : src.isError ? 'erro'
      : value === null || value === undefined ? 'sem_dados'
      : 'ok');
  return {
    value: value ?? null,
    dataset,
    component,
    timestamp: src.updatedAt ? new Date(src.updatedAt).toISOString() : null,
    confidence: availability === 'ok' ? (opts?.confidence ?? 'oficial') : 'indisponivel',
    availability,
    version: opts?.version ?? null,
  };
}

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (v != null ? String(v) : null);

/** Monta o NarrativeInput na ordem oficial. `nowIso` injetado (determinismo). */
export function buildNarrativeContext(
  sources: NarrativeRawSources,
  nowIso: string,
  montagemMs: number | null = null,
): NarrativeInput {
  const he = rec(sources.healthExecutive.data);
  const ae = rec(sources.alertExecutive.data);
  const ad = rec(sources.alertDashboard.data);
  const op = rec(sources.operational.data);
  const gov = rec(sources.governance.data);

  // 1. Situação Geral
  const situacaoGeral = {
    situacao: evidence(sources.healthExecutive, 'health-executive', 'situacao_geral', str(he.situacao_geral)),
    scoreGeral: evidence(sources.healthExecutive, 'health-executive', 'score_geral', num(he.score_geral)),
    tendenciaOperacional: evidence(sources.alertExecutive, 'alert-executive', 'tendencia_operacional', str(ae.tendencia_operacional)),
  };

  // 2. Health
  const healthArr = arr(op.health);
  const saudaveis = healthArr.filter((h) => h.classification === 'Excelente' || h.classification === 'Bom').length;
  const degradados = healthArr.filter((h) => h.classification === 'Atencao' || h.classification === 'Critico').length;
  const health = {
    componentesCriticos: evidence(sources.healthExecutive, 'health-executive', 'componentes_criticos',
      Array.isArray(he.componentes_criticos) ? (he.componentes_criticos as string[]) : null),
    componentesOffline: evidence(sources.healthExecutive, 'health-executive', 'componentes_offline',
      Array.isArray(he.componentes_offline) ? (he.componentes_offline as string[]) : null),
    saudaveis: evidence(sources.operational, 'operational', 'health[].classification',
      healthArr.length ? saudaveis : null, { confidence: 'contagem_presentacional' }),
    degradados: evidence(sources.operational, 'operational', 'health[].classification',
      healthArr.length ? degradados : null, { confidence: 'contagem_presentacional' }),
  };

  // 3. Alertas
  const ativos = arr(ad.ativos);
  const alertas = {
    ativos: evidence(sources.alertExecutive, 'alert-executive', 'alertas_ativos', num(ae.alertas_ativos)),
    criticos: evidence(sources.alertDashboard, 'alert-dashboard', 'ativos[].severity',
      sources.alertDashboard.data == null ? null
        : ativos.filter((a) => a.severity === 'critico' || a.severity === 'emergencia').length,
      { confidence: 'contagem_presentacional' }),
    maioresRiscos: evidence(sources.alertExecutive, 'alert-executive', 'maiores_riscos',
      Array.isArray(ae.maiores_riscos)
        ? (ae.maiores_riscos as Record<string, unknown>[]).map((r) => ({
            regra: String(r.rule_key ?? ''), severidade: String(r.severity ?? ''),
          }))
        : null),
    avisosAntecipados: evidence(sources.alertExecutive, 'alert-executive', 'early_warning',
      Array.isArray(ae.early_warning)
        ? (ae.early_warning as Record<string, unknown>[]).map((w) => String(w.alerta ?? ''))
        : null),
  };

  // 4. Governança
  const validator = rec(gov.validator);
  const cert = rec(gov.certificacao) as Record<string, number>;
  const catalogo = arr(gov.catalogo);
  const governanca = {
    catalogoAprovado: evidence(sources.governance, 'governance', 'validator.aprovado',
      typeof validator.aprovado === 'boolean' ? (validator.aprovado as boolean) : null),
    metricasEnterprise: evidence(sources.governance, 'governance', 'certificacao.enterprise',
      sources.governance.data == null ? null : (cert.enterprise ?? 0)),
    metricasAtivas: evidence(sources.governance, 'governance', 'catalogo[].status',
      catalogo.length ? catalogo.filter((c) => c.status === 'active').length : null,
      { confidence: 'contagem_presentacional' }),
  };

  // 5. Incidentes
  const incs = arr(op.incidentes);
  const incidentes = {
    ativos: evidence(sources.alertExecutive, 'alert-executive', 'incidentes_ativos', num(ae.incidentes_ativos)),
    ultimos: evidence(sources.operational, 'operational', 'incidentes',
      sources.operational.data == null ? null
        : incs.slice(0, 5).map((i) => ({
            componente: String(i.component ?? ''), status: String(i.status ?? ''), inicio: String(i.started_at ?? ''),
          }))),
  };

  // 6. Timeline
  const tl = arr(gov.timeline_recente);
  const timeline = {
    eventosRecentes: evidence(sources.governance, 'governance', 'timeline_recente',
      sources.governance.data == null ? null
        : tl.slice(0, 10).map((t) => ({ em: String(t.em ?? ''), titulo: `${String(t.event ?? '')}: ${String(t.metric ?? '')}` }))),
  };

  // 7. Quality — drafts são 'aguardando_fonte' POR DESENHO, não problema
  const qualityArr = arr(gov.quality);
  const baixas = qualityArr
    .filter((q) => typeof q.score === 'number' && (q.score as number) < 0.7)
    .map((q) => String(q.metric ?? ''));
  const quality = {
    metricasAbaixoDe07: evidence(sources.governance, 'governance', 'quality[].score',
      qualityArr.length ? baixas : null, { confidence: 'contagem_presentacional' }),
  };

  // 8. Issues
  const issuesArr = arr(gov.issues_abertas);
  const issues = {
    abertas: evidence(sources.governance, 'governance', 'issues_abertas',
      sources.governance.data == null ? null : issuesArr.length,
      { confidence: 'contagem_presentacional' }),
    drift: evidence(sources.governance, 'governance', "issues_abertas[].check like 'drift%'",
      sources.governance.data == null ? null
        : issuesArr.filter((i) => String(i.check ?? '').startsWith('drift')).length,
      { confidence: 'contagem_presentacional' }),
  };

  // 9. Executive Summary
  const executiveSummary = {
    disponibilidadeComponentesChave: evidence(sources.alertExecutive, 'alert-executive', 'disponibilidade',
      ae.disponibilidade && typeof ae.disponibilidade === 'object'
        ? (ae.disponibilidade as Record<string, number | null>)
        : null),
  };

  // 10. Filas (M59.3 — aditivo)
  const nc = rec(sources.noc.data);
  const fila = rec(nc.fila);
  const filas = {
    backlogPublicacao: evidence(sources.noc, 'noc', 'fila.backlog', num(fila.backlog)),
    lotesDisponiveis: evidence(sources.noc, 'noc', 'fila.lotes_available', num(fila.lotes_available)),
  };

  // 11. Séries históricas (M59.4 — aditivo; fontes já consumidas)
  const tl24 = arr(op.timeline_24h);
  const t14 = arr(ad.tendencia_14d);
  const series = {
    healthTimeline: evidence(sources.operational, 'operational', 'timeline_24h',
      sources.operational.data == null ? null
        : tl24
            .filter((t) => typeof t.score === 'number')
            .map((t) => ({ component: String(t.component ?? ''), em: String(t.em ?? ''), score: t.score as number }))),
    alertas14d: evidence(sources.alertDashboard, 'alert-dashboard', 'tendencia_14d',
      sources.alertDashboard.data == null ? null
        : t14.map((t) => ({ dia: String(t.dia ?? ''), alertas: Number(t.alertas ?? 0) }))),
  };

  const draft: Omit<NarrativeInput, 'meta'> = {
    situacaoGeral, health, alertas, governanca, incidentes, timeline, quality, issues, executiveSummary, filas, series,
  };

  // estado por seção = pior estado entre as evidências da seção
  const RANK: Record<NarrativeAvailability, number> = {
    ok: 0, aguardando_fonte: 1, incompleto: 2, sem_dados: 3, offline: 4, carregando: 5, erro: 6,
  };
  const estados = {} as Record<NarrativeSectionKey, NarrativeAvailability>;
  for (const key of NARRATIVE_SECTION_ORDER) {
    const fields = Object.values(draft[key]) as NarrativeEvidence[];
    const statuses = fields.map((f) => f.availability);
    const worst = statuses.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok' as NarrativeAvailability);
    // seção parcialmente ok = 'incompleto' (nunca esconder ausência)
    estados[key] =
      worst !== 'ok' && statuses.some((s) => s === 'ok')
        ? worst === 'carregando' || worst === 'erro' ? worst : 'incompleto'
        : worst;
  }

  return {
    meta: {
      engineVersion: 'M59.1',
      geradoEm: nowIso,
      completo: NARRATIVE_SECTION_ORDER.every((k) => estados[k] === 'ok'),
      estados,
      montagemMs,
    },
    ...draft,
  };
}
