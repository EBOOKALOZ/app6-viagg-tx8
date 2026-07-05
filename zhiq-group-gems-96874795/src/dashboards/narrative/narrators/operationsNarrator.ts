/**
 * M59.3 · Operations Narrative AI — o segundo narrador oficial do Programa CIO.
 *
 * Responde: o que está acontecendo AGORA, onde estão os gargalos, o que
 * exige atenção, o que mudou e qual a prioridade operacional.
 * Reutiliza INTEGRALMENTE a infraestrutura do M59.1/.2 (NarrativeInput,
 * evidências, guard, híbrido) — zero arquitetura paralela.
 *
 * Doutrina: 25 seções SEMPRE presentes; vertical sem métrica certificada
 * declara "Aguardando fonte oficial" com evidência REAL da ausência
 * (componente Offline registrado no Health OU catálogo sem métricas da
 * vertical). Nada é inventado, estimado ou inferido.
 */

import type { NarrativeInput, NarrativeEvidence } from '../types';
import type { NarrativeEngineOutput } from '../engine';
import {
  type NarrativeReport, type NarrativeReportSection, type NarrativeSentence,
  diffNarrativeInputs,
} from './executiveDeterministic';
import { narrateHybrid, type NarrateOptions } from './executiveGenerative';

// ── Os 6 templates operacionais oficiais ──────────────────────
export type OperationsTemplateKey =
  | 'operacao_excelente' | 'operacao_estavel' | 'atencao_operacional'
  | 'operacao_critica' | 'operacao_parcial' | 'sistema_offline';

export const OPERATIONS_TEMPLATES: Record<OperationsTemplateKey, { abertura: string; conclusao: string }> = {
  operacao_excelente: {
    abertura: 'Operação EXCELENTE: todos os sinais oficiais dentro do esperado.',
    conclusao: 'Conclusão operacional: excelência; manter cadência de monitoramento.',
  },
  operacao_estavel: {
    abertura: 'Operação ESTÁVEL: plataforma saudável nos sinais oficiais.',
    conclusao: 'Conclusão operacional: estável; acompanhar as prioridades listadas.',
  },
  atencao_operacional: {
    abertura: 'ATENÇÃO OPERACIONAL: há degradação declarada pelos sinais oficiais.',
    conclusao: 'Conclusão operacional: tratar as prioridades desta narrativa antes que escalem.',
  },
  operacao_critica: {
    abertura: 'Operação CRÍTICA: componentes essenciais degradados.',
    conclusao: 'Conclusão operacional: agir AGORA nas prioridades máximas, pelos runbooks do Alert Center.',
  },
  operacao_parcial: {
    abertura: 'Operação PARCIAL: a plataforma responde, mas há fontes oficiais indisponíveis nesta leitura.',
    conclusao: 'Conclusão operacional: normalizar as fontes indisponíveis para leitura completa; nada foi estimado.',
  },
  sistema_offline: {
    abertura: 'SISTEMA OFFLINE para leitura: situação geral indisponível — aguardando fonte oficial.',
    conclusao: 'Conclusão operacional: sem dados para avaliar; verificar implantação, crons e fontes.',
  },
};

/** Escolha do template — regras oficiais, zero cálculo paralelo. */
export function pickOperationsTemplate(input: NarrativeInput): OperationsTemplateKey {
  const situacao = input.situacaoGeral.situacao;
  if (situacao.availability !== 'ok' || situacao.value === null) return 'sistema_offline';
  if (situacao.value === 'CRITICO') return 'operacao_critica';
  if (situacao.value === 'ATENCAO') return 'atencao_operacional';
  // SAUDAVEL — parcial se alguma seção operacional-chave não estiver ok
  const chaves = [input.meta.estados.alertas, input.meta.estados.incidentes, input.meta.estados.filas];
  if (chaves.some((e) => e !== 'ok')) return 'operacao_parcial';
  const score = input.situacaoGeral.scoreGeral;
  if (score.availability === 'ok' && score.value !== null && score.value >= 90) return 'operacao_excelente';
  return 'operacao_estavel';
}

// ── Priorização Inteligente (determinística e auditável) ──────
export type PriorityLevel = 'maxima' | 'alta' | 'media' | 'baixa';

export interface OperationalPriority {
  nivel: PriorityLevel;
  titulo: string;
  impacto: 'alto' | 'medio' | 'baixo';
  urgencia: 'imediata' | 'curto_prazo' | 'planejada';
  justificativa: string;
  evidencias: string[];
}

const LEVEL_RANK: Record<PriorityLevel, number> = { maxima: 0, alta: 1, media: 2, baixa: 3 };

/** Regras fixas sobre estados OFICIAIS — sem limiar inventado. */
export function computePriorities(input: NarrativeInput): OperationalPriority[] {
  const out: OperationalPriority[] = [];
  const gv = input.governanca;
  const h = input.health;
  const al = input.alertas;
  const inc = input.incidentes;
  const is = input.issues;
  const q = input.quality;

  if (gv.catalogoAprovado.availability === 'ok' && gv.catalogoAprovado.value === false) {
    out.push({
      nivel: 'maxima', titulo: 'Catálogo semântico REPROVADO pelo validator',
      impacto: 'alto', urgencia: 'imediata',
      justificativa: 'Com o catálogo reprovado, nenhum número da plataforma é confiável até correção.',
      evidencias: ['governanca.catalogoAprovado'],
    });
  }
  if (h.componentesCriticos.availability === 'ok' && (h.componentesCriticos.value?.length ?? 0) > 0) {
    out.push({
      nivel: 'maxima', titulo: `Componentes críticos: ${h.componentesCriticos.value!.join(', ')}`,
      impacto: 'alto', urgencia: 'imediata',
      justificativa: 'Classificação Crítico é o pior estado oficial do Health Center; dependentes são afetados.',
      evidencias: ['health.componentesCriticos'],
    });
  }
  if (al.criticos.availability === 'ok' && (al.criticos.value ?? 0) > 0) {
    out.push({
      nivel: 'alta', titulo: `${al.criticos.value} alerta(s) em severidade crítica/emergência`,
      impacto: 'alto', urgencia: 'imediata',
      justificativa: 'Alertas críticos ativos exigem reconhecimento e tratamento pelo Alert Center.',
      evidencias: ['alertas.criticos', 'alertas.maioresRiscos'],
    });
  }
  if (inc.ativos.availability === 'ok' && (inc.ativos.value ?? 0) > 0) {
    out.push({
      nivel: 'alta', titulo: `${inc.ativos.value} incidente(s) aberto(s)`,
      impacto: 'alto', urgencia: 'curto_prazo',
      justificativa: 'Incidentes abertos representam degradação em curso registrada oficialmente.',
      evidencias: ['incidentes.ativos', 'incidentes.ultimos'],
    });
  }
  if (al.avisosAntecipados.availability === 'ok' && (al.avisosAntecipados.value?.length ?? 0) > 0) {
    out.push({
      nivel: 'media', titulo: `Tendências de risco (early warning): ${al.avisosAntecipados.value!.join(', ')}`,
      impacto: 'medio', urgencia: 'curto_prazo',
      justificativa: 'Detecções ANTES da falha — janela de ação preventiva.',
      evidencias: ['alertas.avisosAntecipados'],
    });
  }
  if (is.drift.availability === 'ok' && (is.drift.value ?? 0) > 0) {
    out.push({
      nivel: 'media', titulo: `${is.drift.value} apontamento(s) de drift`,
      impacto: 'medio', urgencia: 'curto_prazo',
      justificativa: 'Drift indica métrica congelada ou mudança brusca vs baseline oficial.',
      evidencias: ['issues.drift'],
    });
  }
  if (q.metricasAbaixoDe07.availability === 'ok' && (q.metricasAbaixoDe07.value?.length ?? 0) > 0) {
    out.push({
      nivel: 'media', titulo: `Qualidade baixa em: ${q.metricasAbaixoDe07.value!.join(', ')}`,
      impacto: 'medio', urgencia: 'planejada',
      justificativa: 'Score de qualidade oficial abaixo de 0.7 (eixos confiança/completude/atualidade/consistência).',
      evidencias: ['quality.metricasAbaixoDe07'],
    });
  }
  if (h.componentesOffline.availability === 'ok' && (h.componentesOffline.value?.length ?? 0) > 0) {
    out.push({
      nivel: 'baixa', titulo: `${h.componentesOffline.value!.length} componente(s) sem telemetria`,
      impacto: 'baixo', urgencia: 'planejada',
      justificativa: 'Sem fonte não há leitura — instrumentar amplia a visibilidade (nada é estimado).',
      evidencias: ['health.componentesOffline'],
    });
  }
  return out.sort((a, b) => LEVEL_RANK[a.nivel] - LEVEL_RANK[b.nivel]);
}

// ── Recomendações auditáveis (derivadas 1:1 das prioridades) ──
export interface OperationalRecommendation {
  acao: string;
  motivo: string;
  evidencias: string[];
}

const ACTION_BY_TITLE: [RegExp, string][] = [
  [/Catálogo/i, 'Rodar cio_semantic_validate(), corrigir a definição ofensora com NOVA versão e revalidar.'],
  [/Componentes críticos/i, 'Abrir o NOC, executar cio_root_cause() e seguir o runbook do componente.'],
  [/alerta\(s\) em severidade/i, 'Reconhecer no Alert Center e executar os passos de cio_alert_recommendations().'],
  [/incidente/i, 'Acompanhar no painel operacional até a auto-resolução; investigar a causa registrada.'],
  [/early warning/i, 'Investigar a tendência apontada antes que vire alerta (janela preventiva).'],
  [/drift/i, 'Rodar cio_drift_scan(7) e confirmar se é sazonalidade ou falha de fonte.'],
  [/Qualidade baixa/i, 'Revisar as métricas listadas em cio_metric_quality() e completar documentação/fonte.'],
  [/sem telemetria/i, 'Priorizar instrumentação das fontes ausentes no roadmap (M58.3/M60).'],
];

export function computeRecommendations(priorities: OperationalPriority[]): OperationalRecommendation[] {
  if (priorities.length === 0) {
    return [{
      acao: 'Nenhuma ação corretiva requerida pelas fontes oficiais; manter monitoramento.',
      motivo: 'Nenhuma prioridade foi apontada pelos estados oficiais nesta leitura.',
      evidencias: ['situacaoGeral.situacao'],
    }];
  }
  return priorities.map((p) => ({
    acao: ACTION_BY_TITLE.find(([re]) => re.test(p.titulo))?.[1]
      ?? 'Seguir o runbook determinístico correspondente no Alert Center.',
    motivo: `${p.titulo} — ${p.justificativa}`,
    evidencias: p.evidencias,
  }));
}

// ── As 25 seções obrigatórias ─────────────────────────────────
const s = (texto: string, ...evidencias: string[]): NarrativeSentence => ({ texto, evidencias });
const AGUARDANDO = 'Aguardando fonte oficial';

function fromEv<T>(
  label: string, path: string, ev: NarrativeEvidence<T>,
  render: (v: NonNullable<T>) => string,
): NarrativeSentence {
  if (ev.availability !== 'ok' || ev.value === null || ev.value === undefined) {
    return s(`${label}: ${AGUARDANDO} (${ev.availability}).`, path);
  }
  return s(render(ev.value as NonNullable<T>), path);
}

/** Vertical registrada como componente Offline vs. ausente do catálogo. */
function verticalSection(
  key: string, titulo: string, input: NarrativeInput, componentName?: string,
): NarrativeReportSection {
  const offline = input.health.componentesOffline;
  const isRegisteredOffline =
    componentName != null &&
    offline.availability === 'ok' &&
    (offline.value ?? []).includes(componentName);
  const frase = isRegisteredOffline
    ? s(`${titulo}: componente registrado no Health Center SEM telemetria — ${AGUARDANDO}.`,
        'health.componentesOffline')
    : s(`${titulo}: sem métricas certificadas no catálogo oficial — ${AGUARDANDO} (M58.3 suspenso até certificação).`,
        'governanca.metricasAtivas');
  return { key, titulo, frases: [frase] };
}

export function buildOperationsSections(
  input: NarrativeInput,
  template: OperationsTemplateKey,
  priorities: OperationalPriority[],
  recommendations: OperationalRecommendation[],
): NarrativeReportSection[] {
  const sg = input.situacaoGeral;
  const h = input.health;
  const al = input.alertas;
  const inc = input.incidentes;
  const f = input.filas;
  const es = input.executiveSummary;

  const panorama: NarrativeReportSection = {
    key: 'panorama', titulo: 'Panorama Operacional',
    frases: [
      s(OPERATIONS_TEMPLATES[template].abertura, 'situacaoGeral.situacao'),
      fromEv('Score operacional', 'situacaoGeral.scoreGeral', sg.scoreGeral,
        (v) => `Score operacional (Health geral oficial): ${v} em 100.`),
      fromEv('Tendência', 'situacaoGeral.tendenciaOperacional', sg.tendenciaOperacional,
        (v) => `Tendência operacional: "${v}".`),
    ],
  };

  const saude: NarrativeReportSection = {
    key: 'saude', titulo: 'Saúde Geral da Plataforma',
    frases: [
      fromEv('Críticos', 'health.componentesCriticos', h.componentesCriticos,
        (v) => (v.length === 0 ? 'Nenhum componente crítico.' : `Críticos: ${v.join(', ')}.`)),
      fromEv('Saudáveis', 'health.saudaveis', h.saudaveis, (v) => `${v} componente(s) saudável(is).`),
      fromEv('Degradados', 'health.degradados', h.degradados, (v) => `${v} em degradação.`),
    ],
  };

  const divulgacao: NarrativeReportSection = {
    key: 'divulgacao', titulo: 'Divulgação / Impulsionamento',
    frases: [
      fromEv('Fila de publicação', 'filas.backlogPublicacao', f.backlogPublicacao,
        (v) => (v === 0 ? 'Fila de publicação vazia.' : `${v} solicitação(ões) aguardando despacho.`)),
      fromEv('Lotes disponíveis', 'filas.lotesDisponiveis', f.lotesDisponiveis,
        (v) => `${v} lote(s) disponível(is) para o postador.`),
    ],
  };

  const infraestrutura: NarrativeReportSection = {
    key: 'infraestrutura', titulo: 'Infraestrutura',
    frases: [
      fromEv('Infraestrutura', 'health.componentesCriticos', h.componentesCriticos,
        (v) => {
          const infra = v.filter((c) => ['banco', 'jobs', 'rpcs'].includes(c));
          return infra.length === 0
            ? 'Sem apontamentos críticos de infraestrutura (banco/jobs/RPCs).'
            : `Infraestrutura crítica: ${infra.join(', ')}.`;
        }),
    ],
  };

  const performance: NarrativeReportSection = {
    key: 'performance', titulo: 'Performance',
    frases: [
      fromEv('Disponibilidade', 'executiveSummary.disponibilidadeComponentesChave',
        es.disponibilidadeComponentesChave,
        (v) => {
          const entries = Object.entries(v).filter(([, pct]) => pct != null);
          return entries.length === 0
            ? `Disponibilidade: ${AGUARDANDO} (sem janelas medidas).`
            : `Disponibilidade 30d: ${entries.map(([c, pct]) => `${c} ${pct}%`).join(', ')}.`;
        }),
    ],
  };

  const alertasSec: NarrativeReportSection = {
    key: 'alertas', titulo: 'Alertas',
    frases: [
      fromEv('Ativos', 'alertas.ativos', al.ativos,
        (v) => (v === 0 ? 'Nenhum alerta ativo.' : `${v} alerta(s) ativo(s).`)),
      fromEv('Críticos', 'alertas.criticos', al.criticos,
        (v) => (v === 0 ? 'Nenhum crítico/emergência.' : `${v} em severidade crítica/emergência.`)),
      fromEv('Early warning', 'alertas.avisosAntecipados', al.avisosAntecipados,
        (v) => (v.length === 0 ? 'Sem tendências de risco detectadas.' : `Tendências: ${v.join(', ')}.`)),
    ],
  };

  const gargalos: NarrativeReportSection = {
    key: 'gargalos', titulo: 'Gargalos',
    frases: [
      fromEv('Fila', 'filas.backlogPublicacao', f.backlogPublicacao,
        (v) => (v === 0
          ? 'Sem gargalo de fila: backlog de publicação zerado.'
          : `Fila atual: ${v} solicitação(ões) — gargalo é APONTADO pelas regras oficiais quando ultrapassar o limiar calibrado (regra backlog_alto, hoje desligada até OBSERVE).`)),
      fromEv('Incidentes', 'incidentes.ativos', inc.ativos,
        (v) => (v === 0 ? 'Nenhum gargalo por incidente ativo.' : `${v} incidente(s) ativo(s) podem represar o fluxo.`)),
    ],
  };

  const oportunidades: NarrativeReportSection = {
    key: 'oportunidades', titulo: 'Oportunidades',
    frases: [
      fromEv('Certificação', 'governanca.metricasEnterprise', input.governanca.metricasEnterprise,
        (v) => (v === 0
          ? 'Certificar métricas como enterprise habilita a narrativa executiva completa da IA (hoje: 0 certificadas — declarado).'
          : `${v} métrica(s) enterprise já certificadas; ampliar cobertura.`)),
      fromEv('Instrumentação', 'health.componentesOffline', h.componentesOffline,
        (v) => (v.length === 0
          ? 'Todos os componentes registrados possuem telemetria — visibilidade completa.'
          : `Instrumentar ${v.join(', ')} destrava as seções de vertical desta narrativa.`)),
    ],
  };

  const recomendacoesSec: NarrativeReportSection = {
    key: 'recomendacoes', titulo: 'Recomendações da IA',
    frases: recommendations.map((r) => s(`${r.acao} Motivo: ${r.motivo}`, ...r.evidencias)),
  };

  const conclusao: NarrativeReportSection = {
    key: 'conclusao', titulo: 'Conclusão Operacional',
    frases: [s(OPERATIONS_TEMPLATES[template].conclusao, 'situacaoGeral.situacao', 'situacaoGeral.scoreGeral')],
  };

  return [
    panorama,
    saude,
    verticalSection('mobilidade', 'Mobilidade', input),
    verticalSection('motoristas', 'Motoristas', input),
    verticalSection('mototaxi', 'Moto Táxi', input),
    verticalSection('motoboys', 'Motoboys', input),
    verticalSection('passageiros', 'Passageiros', input),
    verticalSection('marketplace', 'Marketplace', input, 'marketplace'),
    verticalSection('lojistas', 'Lojistas', input),
    verticalSection('pedidos', 'Pedidos', input),
    verticalSection('corridas', 'Corridas', input, 'corridas'),
    verticalSection('entregas', 'Entregas', input, 'entregas'),
    divulgacao,
    verticalSection('financeiro', 'Financeiro', input),
    verticalSection('assinaturas', 'Assinaturas', input),
    verticalSection('atendimento', 'Atendimento', input),
    verticalSection('suporte', 'Suporte', input),
    {
      key: 'seguranca', titulo: 'Segurança',
      frases: [
        fromEv('Integridade', 'governanca.catalogoAprovado', input.governanca.catalogoAprovado,
          (v) => (v ? 'Integridade dos dados: catálogo aprovado pelo self-audit.' : 'Integridade em risco: catálogo REPROVADO.')),
        s(`Auditoria de segurança dedicada: ${AGUARDANDO} (dataset específico no roadmap).`, 'governanca.catalogoAprovado'),
      ],
    },
    infraestrutura,
    performance,
    alertasSec,
    gargalos,
    oportunidades,
    recomendacoesSec,
    conclusao,
  ];
}

// ── Snapshot expandido: indicadores + prioridades + alertas ───
export function diffOperationalSnapshots(
  prev: NarrativeInput | null,
  cur: NarrativeInput,
): NarrativeSentence[] {
  if (!prev) return [s('Primeira execução registrada.', 'situacaoGeral.situacao')];
  const base = diffNarrativeInputs(prev, cur); // indicadores-chave (M59.2)
  const out = base[0]?.texto.startsWith('Sem mudanças') ? [] : [...base];

  // prioridades e gargalos: recomputados deterministicamente sobre cada snapshot
  const pPrev = computePriorities(prev);
  const pCur = computePriorities(cur);
  if (pPrev.length !== pCur.length) {
    out.push(s(`prioridades operacionais: ${pPrev.length} → ${pCur.length}.`,
      ...(pCur[0]?.evidencias ?? ['situacaoGeral.situacao'])));
  }
  const fPrev = prev.filas.backlogPublicacao.value;
  const fCur = cur.filas.backlogPublicacao.value;
  if (fPrev !== fCur && (fPrev !== null || fCur !== null)) {
    out.push(s(`fila de publicação: ${fPrev ?? 'sem dado'} → ${fCur ?? 'sem dado'}.`, 'filas.backlogPublicacao'));
  }
  return out.length ? out : [s('Sem mudanças operacionais desde a última execução.', 'situacaoGeral.situacao')];
}

// ── O narrador (determinístico + híbrido) ─────────────────────
export interface OperationsNarrativeResult {
  report: NarrativeReport;
  priorities: OperationalPriority[];
  recommendations: OperationalRecommendation[];
}

export function narrateOperationsDeterministic(
  engineOutput: NarrativeEngineOutput,
  prev: NarrativeInput | null = null,
): OperationsNarrativeResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const input = engineOutput.input;
  const template = pickOperationsTemplate(input);
  const priorities = computePriorities(input);
  const recommendations = computeRecommendations(priorities);
  const secoes = buildOperationsSections(input, template, priorities, recommendations);
  const mudancas = diffOperationalSnapshots(prev, input);
  const duracaoMs =
    typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 100) / 100 : null;
  return {
    report: {
      narrator: 'operations', modo: 'deterministico', template,
      geradoEm: input.meta.geradoEm, duracaoMs, secoes, mudancas,
    },
    priorities,
    recommendations,
  };
}

/** Operations Narrator híbrido — mesmo orquestrador/guard/fallback do M59.2. */
export async function narrateOperations(
  engineOutput: NarrativeEngineOutput,
  opts: NarrateOptions = {},
): Promise<OperationsNarrativeResult> {
  const det = narrateOperationsDeterministic(engineOutput, opts.prev ?? null);
  const report = await narrateHybrid(det.report, engineOutput.input, opts);
  return { ...det, report };
}

export const OPERATIONS_SECTION_COUNT = 25;
