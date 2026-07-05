/**
 * M59.5 · Strategic Narrative AI — o quarto narrador oficial: um COMPOSER.
 *
 * NÃO interpreta datasets, NÃO consome fontes novas, NÃO recomputa nada:
 * recebe os NarrativeReports/resultados JÁ EXECUTADOS dos três narradores
 * (Executive, Operations, Predictive) e compõe, sintetiza e prioriza.
 * Consenso = mesma direção no mesmo tópico por ≥2 narradores ⇒ conclusão
 * reforçada com TODAS as evidências. Divergência = direções opostas ⇒
 * DECLARADA, sem escolher vencedor. Significados nunca são alterados:
 * frases das fontes entram literais; sínteses novas carregam a união das
 * evidências de origem.
 */

import {
  type NarrativeReport, type NarrativeReportSection, type NarrativeSentence,
} from './executiveDeterministic';
import type { OperationsNarrativeResult, OperationalPriority, PriorityLevel } from './operationsNarrator';
import type { PredictiveNarrativeResult, PredictiveFinding } from './predictiveNarrator';
import type { NarrativeInput } from '../types';
import { narrateHybrid, type NarrateOptions } from './executiveGenerative';

// ── Tópicos de domínio (derivados dos caminhos de evidência) ──
const TOPIC_BY_EVIDENCE: [RegExp, string][] = [
  [/^health\.|^series\.healthTimeline/, 'saude_componentes'],
  [/^alertas\.|^series\.alertas14d/, 'alertas'],
  [/^filas\./, 'filas'],
  [/^governanca\./, 'governanca'],
  [/^quality\.|^issues\./, 'qualidade'],
  [/^incidentes\./, 'incidentes'],
  [/^situacaoGeral\./, 'geral'],
];

export function topicOf(evidencePath: string): string {
  return TOPIC_BY_EVIDENCE.find(([re]) => re.test(evidencePath))?.[1] ?? 'outros';
}

// ── Sinais estruturados (SÓ dos artefatos dos narradores) ─────
export type NarratorOrigin = 'executive' | 'operations' | 'predictive';

export interface StrategicSignal {
  origem: NarratorOrigin;
  topico: string;
  direcao: 'negativo' | 'positivo';
  titulo: string;
  justificativa: string;
  evidencias: string[];
  /** peso herdado da origem (nível de prioridade ou confiança) */
  peso: string;
}

const NEG_TEMPLATES = ['critica', 'atencao', 'operacao_critica', 'atencao_operacional', 'tendencia_negativa'];
const POS_TEMPLATES = ['excelente', 'boa', 'operacao_excelente', 'operacao_estavel', 'tendencia_positiva', 'tendencia_estavel'];

export function collectSignals(
  exec: NarrativeReport | null,
  ops: OperationsNarrativeResult | null,
  pred: PredictiveNarrativeResult | null,
): StrategicSignal[] {
  const out: StrategicSignal[] = [];

  const templateSignal = (origem: NarratorOrigin, report: NarrativeReport): void => {
    const abertura = report.secoes[0]?.frases[0];
    if (!abertura) return;
    if (NEG_TEMPLATES.includes(report.template)) {
      out.push({ origem, topico: 'geral', direcao: 'negativo', titulo: abertura.texto,
        justificativa: `template ${report.template} do narrador ${origem}`, evidencias: abertura.evidencias, peso: report.template });
    } else if (POS_TEMPLATES.includes(report.template)) {
      out.push({ origem, topico: 'geral', direcao: 'positivo', titulo: abertura.texto,
        justificativa: `template ${report.template} do narrador ${origem}`, evidencias: abertura.evidencias, peso: report.template });
    }
    // offline/parcial/insuficiente: nem positivo nem negativo — não vira sinal
  };

  if (exec) templateSignal('executive', exec);
  if (ops) {
    templateSignal('operations', ops.report);
    for (const p of ops.priorities) {
      out.push({ origem: 'operations', topico: topicOf(p.evidencias[0] ?? ''), direcao: 'negativo',
        titulo: p.titulo, justificativa: p.justificativa, evidencias: p.evidencias, peso: p.nivel });
    }
  }
  if (pred) {
    templateSignal('predictive', pred.report);
    for (const r of pred.risks) {
      out.push({ origem: 'predictive', topico: topicOf(r.evidencias[0] ?? ''), direcao: 'negativo',
        titulo: r.titulo, justificativa: r.base, evidencias: r.evidencias, peso: r.confianca });
    }
    for (const o of pred.opportunities) {
      out.push({ origem: 'predictive', topico: topicOf(o.evidencias[0] ?? ''), direcao: 'positivo',
        titulo: o.titulo, justificativa: o.base, evidencias: o.evidencias, peso: o.confianca });
    }
  }
  return out;
}

// ── Consenso e divergência ────────────────────────────────────
export interface ConsensusFinding {
  topico: string;
  direcao: 'negativo' | 'positivo';
  origens: NarratorOrigin[];
  titulos: string[];
  evidencias: string[];   // união, preservadas
}

export interface Divergence {
  topico: string;
  posicoes: { origem: NarratorOrigin; direcao: 'negativo' | 'positivo'; titulo: string; evidencias: string[] }[];
}

export function findConsensusAndDivergence(signals: StrategicSignal[]): {
  consensos: ConsensusFinding[];
  divergencias: Divergence[];
} {
  const byTopic = new Map<string, StrategicSignal[]>();
  for (const s of signals) {
    if (!byTopic.has(s.topico)) byTopic.set(s.topico, []);
    byTopic.get(s.topico)!.push(s);
  }
  const consensos: ConsensusFinding[] = [];
  const divergencias: Divergence[] = [];
  for (const [topico, list] of [...byTopic.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dirs = new Set(list.map((s) => s.direcao));
    const origins = new Set(list.map((s) => s.origem));
    if (dirs.size > 1) {
      divergencias.push({
        topico,
        posicoes: list.map((s) => ({ origem: s.origem, direcao: s.direcao, titulo: s.titulo, evidencias: s.evidencias })),
      });
    } else if (origins.size >= 2) {
      consensos.push({
        topico,
        direcao: list[0].direcao,
        origens: [...origins].sort() as NarratorOrigin[],
        titulos: list.map((s) => s.titulo),
        evidencias: [...new Set(list.flatMap((s) => s.evidencias))],
      });
    }
  }
  return { consensos, divergencias };
}

// ── Priorização consolidada ───────────────────────────────────
export interface StrategicPriority {
  nivel: PriorityLevel;
  reforcadaPorConsenso: boolean;
  titulo: string;
  impacto: 'alto' | 'medio' | 'baixo';
  urgencia: 'imediata' | 'curto_prazo' | 'planejada';
  origens: NarratorOrigin[];
  justificativa: string;
  evidencias: string[];
}

const LEVEL_RANK: Record<PriorityLevel, number> = { maxima: 0, alta: 1, media: 2, baixa: 3 };

export function consolidatePriorities(
  ops: OperationsNarrativeResult | null,
  pred: PredictiveNarrativeResult | null,
  consensos: ConsensusFinding[],
): StrategicPriority[] {
  const consensualTopics = new Set(consensos.filter((c) => c.direcao === 'negativo').map((c) => c.topico));
  const out: StrategicPriority[] = [];

  for (const p of ops?.priorities ?? []) {
    const topico = topicOf(p.evidencias[0] ?? '');
    const reforcada = consensualTopics.has(topico);
    out.push({
      nivel: p.nivel, reforcadaPorConsenso: reforcada, titulo: p.titulo,
      impacto: p.impacto, urgencia: p.urgencia,
      origens: reforcada ? ['operations', 'predictive'] : ['operations'],
      justificativa: reforcada ? `${p.justificativa} Reforçada por consenso com o narrador preditivo.` : p.justificativa,
      evidencias: reforcada
        ? [...new Set([...p.evidencias, ...consensos.filter((c) => c.topico === topico).flatMap((c) => c.evidencias)])]
        : p.evidencias,
    });
  }
  // riscos preditivos SEM eco operacional entram como prioridade média
  // (tendência ainda não é estado atual — regra fixa declarada)
  const opsTopics = new Set((ops?.priorities ?? []).map((p) => topicOf(p.evidencias[0] ?? '')));
  for (const r of pred?.risks ?? []) {
    const topico = topicOf(r.evidencias[0] ?? '');
    if (opsTopics.has(topico)) continue; // já consolidado acima
    out.push({
      nivel: 'media', reforcadaPorConsenso: false, titulo: r.titulo,
      impacto: 'medio', urgencia: 'curto_prazo', origens: ['predictive'],
      justificativa: `${r.base} (tendência preditiva sem eco operacional atual — prioridade média por regra fixa).`,
      evidencias: r.evidencias,
    });
  }
  return out.sort((a, b) =>
    LEVEL_RANK[a.nivel] - LEVEL_RANK[b.nivel] ||
    Number(b.reforcadaPorConsenso) - Number(a.reforcadaPorConsenso));
}

// ── Decisões recomendadas (das prioridades + recomendações) ──
export interface StrategicDecision {
  decisao: string;
  impactoEsperado: string;
  origens: NarratorOrigin[];
  evidencias: string[];
}

export function deriveDecisions(
  priorities: StrategicPriority[],
  ops: OperationsNarrativeResult | null,
): StrategicDecision[] {
  if (priorities.length === 0) {
    return [{
      decisao: 'Nenhuma decisão corretiva requerida: manter monitoramento e avançar o roadmap planejado.',
      impactoEsperado: 'preservação do estado saudável',
      origens: ['executive', 'operations', 'predictive'],
      evidencias: ['situacaoGeral.situacao'],
    }];
  }
  const recs = ops?.recommendations ?? [];
  return priorities.slice(0, 3).map((p, i) => ({
    decisao: recs[i]?.acao ?? `Tratar: ${p.titulo} (runbooks determinísticos do Alert Center).`,
    impactoEsperado: `mitigação de prioridade ${p.nivel} (impacto ${p.impacto}, urgência ${p.urgencia})`,
    origens: p.origens,
    evidencias: p.evidencias,
  }));
}

// ── Templates estratégicos (composição dos templates das origens) ──
export type StrategicTemplateKey =
  | 'estrategia_consolidada_positiva' | 'estrategia_estavel' | 'estrategia_atencao'
  | 'estrategia_critica' | 'estrategia_parcial';

export const STRATEGIC_TEMPLATES: Record<StrategicTemplateKey, { abertura: string; conclusao: string }> = {
  estrategia_consolidada_positiva: {
    abertura: 'Visão estratégica POSITIVA: os três narradores convergem para um cenário favorável.',
    conclusao: 'Conclusão estratégica: capitalizar a estabilidade — investir nas oportunidades listadas.',
  },
  estrategia_estavel: {
    abertura: 'Visão estratégica ESTÁVEL: operação saudável sem tendências adversas relevantes.',
    conclusao: 'Conclusão estratégica: manter o curso e executar as prioridades planejadas.',
  },
  estrategia_atencao: {
    abertura: 'Visão estratégica de ATENÇÃO: há sinais adversos que exigem decisão.',
    conclusao: 'Conclusão estratégica: executar as decisões recomendadas antes que os riscos escalem.',
  },
  estrategia_critica: {
    abertura: 'Visão estratégica CRÍTICA: pelo menos um narrador aponta estado crítico.',
    conclusao: 'Conclusão estratégica: foco total nas prioridades máximas — decisões imediatas.',
  },
  estrategia_parcial: {
    abertura: 'Visão estratégica PARCIAL: parte dos narradores sem dados suficientes.',
    conclusao: 'Conclusão estratégica: decidir com o que há de oficial e normalizar as fontes ausentes.',
  },
};

export function pickStrategicTemplate(
  exec: NarrativeReport | null,
  ops: OperationsNarrativeResult | null,
  pred: PredictiveNarrativeResult | null,
): StrategicTemplateKey {
  const templates = [exec?.template, ops?.report.template, pred?.report.template].filter(Boolean) as string[];
  if (templates.length < 3) return 'estrategia_parcial';
  if (templates.some((t) => ['critica', 'operacao_critica'].includes(t))) return 'estrategia_critica';
  if (templates.some((t) => ['offline', 'sistema_offline', 'historico_insuficiente', 'operacao_parcial'].includes(t)))
    return 'estrategia_parcial';
  if (templates.some((t) => ['atencao', 'atencao_operacional', 'tendencia_negativa', 'tendencias_mistas'].includes(t)))
    return 'estrategia_atencao';
  if (templates.includes('tendencia_positiva') || templates.includes('excelente') || templates.includes('operacao_excelente'))
    return 'estrategia_consolidada_positiva';
  return 'estrategia_estavel';
}

// ── Composição das 12 seções ──────────────────────────────────
const s = (texto: string, ...evidencias: string[]): NarrativeSentence => ({ texto, evidencias });

/** Reuso LITERAL de frases de uma seção de origem (significado intacto). */
function reuse(report: NarrativeReport | null, key: string, max: number, indisponivel: string): NarrativeSentence[] {
  const sec = report?.secoes.find((x) => x.key === key);
  if (!sec || sec.frases.length === 0) return [s(indisponivel, 'situacaoGeral.situacao')];
  return sec.frases.slice(0, max);
}

export interface StrategicResult {
  report: NarrativeReport;
  consensos: ConsensusFinding[];
  divergencias: Divergence[];
  priorities: StrategicPriority[];
  decisions: StrategicDecision[];
  narradores: NarratorOrigin[];
}

export function composeStrategic(
  exec: NarrativeReport | null,
  ops: OperationsNarrativeResult | null,
  pred: PredictiveNarrativeResult | null,
): StrategicResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const narradores = ([
    exec && 'executive', ops && 'operations', pred && 'predictive',
  ].filter(Boolean)) as NarratorOrigin[];

  const signals = collectSignals(exec, ops, pred);
  const { consensos, divergencias } = findConsensusAndDivergence(signals);
  const priorities = consolidatePriorities(ops, pred, consensos);
  const decisions = deriveDecisions(priorities, ops);
  const template = pickStrategicTemplate(exec, ops, pred);

  const AUSENTE = (n: string) => `Narrador ${n} indisponível nesta composição — declarado, nunca substituído.`;

  const secoes: NarrativeReportSection[] = [
    {
      key: 'resumo', titulo: 'Resumo Executivo',
      frases: [
        s(STRATEGIC_TEMPLATES[template].abertura, 'situacaoGeral.situacao'),
        exec ? exec.secoes[0].frases[0] : s(AUSENTE('executivo'), 'situacaoGeral.situacao'),
        ops ? ops.report.secoes[0].frases[0] : s(AUSENTE('operacional'), 'situacaoGeral.situacao'),
        pred ? pred.report.secoes[0].frases[0] : s(AUSENTE('preditivo'), 'situacaoGeral.situacao'),
      ],
    },
    { key: 'estadoGeral', titulo: 'Estado Geral da Plataforma',
      frases: [...reuse(exec, 'situacao', 3, AUSENTE('executivo')), ...reuse(exec, 'health', 3, '')].filter((f) => f.texto) },
    { key: 'situacaoOperacional', titulo: 'Situação Operacional',
      frases: [...reuse(ops?.report ?? null, 'panorama', 2, AUSENTE('operacional')),
               ...reuse(ops?.report ?? null, 'gargalos', 2, '')].filter((f) => f.texto) },
    { key: 'tendencias', titulo: 'Tendências Estratégicas',
      frases: reuse(pred?.report ?? null, 'tendenciasGerais', 6, AUSENTE('preditivo')) },
    { key: 'indicadores', titulo: 'Principais Indicadores',
      frases: [...reuse(exec, 'situacao', 2, AUSENTE('executivo')),
               ...reuse(ops?.report ?? null, 'divulgacao', 2, ''),
               ...reuse(pred?.report ?? null, 'saude', 1, '')].filter((f) => f.texto) },
    {
      key: 'riscos', titulo: 'Maiores Riscos',
      frases: [
        ...consensos.filter((c) => c.direcao === 'negativo').map((c) =>
          s(`CONSENSO (${c.origens.join(' + ')}) em ${c.topico}: ${c.titulos.join(' · ')}`, ...c.evidencias)),
        ...(pred?.risks ?? []).map((r) => s(`${r.titulo} — ${r.base}.`, ...r.evidencias)),
        ...divergencias.map((d) =>
          s(`DIVERGÊNCIA declarada em ${d.topico} (sem vencedor): ${d.posicoes.map((p) => `${p.origem}=${p.direcao} (${p.titulo})`).join(' vs ')}`,
            ...[...new Set(d.posicoes.flatMap((p) => p.evidencias))])),
      ].slice(0, 8).concat(
        consensos.filter((c) => c.direcao === 'negativo').length + (pred?.risks.length ?? 0) + divergencias.length === 0
          ? [s('Nenhum risco estratégico apontado pelos narradores.', 'situacaoGeral.situacao')] : []),
    },
    {
      key: 'oportunidades', titulo: 'Maiores Oportunidades',
      frases: (pred?.opportunities ?? []).length === 0
        ? [s('Nenhuma oportunidade emergente apontada pelos narradores.', 'situacaoGeral.situacao')]
        : (pred?.opportunities ?? []).map((o) => s(`${o.titulo} — ${o.base}.`, ...o.evidencias)),
    },
    {
      key: 'prioridades', titulo: 'Prioridades Estratégicas',
      frases: priorities.length === 0
        ? [s('Sem prioridades estratégicas nesta leitura.', 'situacaoGeral.situacao')]
        : priorities.map((p) =>
            s(`[${p.nivel.toUpperCase()}${p.reforcadaPorConsenso ? ' · CONSENSO' : ''}] ${p.titulo} (origem: ${p.origens.join('+')}; impacto ${p.impacto}; urgência ${p.urgencia}). ${p.justificativa}`,
              ...p.evidencias)),
    },
    {
      key: 'recomendacoes', titulo: 'Recomendações Executivas',
      frases: (ops?.recommendations ?? []).length === 0
        ? [s(AUSENTE('operacional'), 'situacaoGeral.situacao')]
        : (ops?.recommendations ?? []).slice(0, 5).map((r) => s(`${r.acao} Motivo: ${r.motivo}`, ...r.evidencias)),
    },
    {
      key: 'decisoes', titulo: 'Decisões Recomendadas',
      frases: decisions.map((d) =>
        s(`DECISÃO: ${d.decisao} Impacto esperado: ${d.impactoEsperado} (base: ${d.origens.join('+')}).`, ...d.evidencias)),
    },
    {
      key: 'comparacao', titulo: 'Comparação com a Execução Anterior',
      frases: [...new Map(
        [...(exec?.mudancas ?? []), ...(ops?.report.mudancas ?? [])].map((m) => [m.texto, m]),
      ).values()],
    },
    { key: 'conclusao', titulo: 'Conclusão Estratégica',
      frases: [s(STRATEGIC_TEMPLATES[template].conclusao, 'situacaoGeral.situacao')] },
  ];

  const duracaoMs =
    typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 100) / 100 : null;

  return {
    report: {
      narrator: 'strategic', modo: 'deterministico', template,
      geradoEm: exec?.geradoEm ?? ops?.report.geradoEm ?? pred?.report.geradoEm ?? '',
      duracaoMs, secoes,
      mudancas: exec?.mudancas ?? [s('Primeira execução da sessão — sem base de comparação.', 'situacaoGeral.situacao')],
    },
    consensos, divergencias, priorities, decisions, narradores,
  };
}

/** Strategic híbrido — mesmo orquestrador/guard/fallback dos demais. */
export async function narrateStrategic(
  exec: NarrativeReport | null,
  ops: OperationsNarrativeResult | null,
  pred: PredictiveNarrativeResult | null,
  input: NarrativeInput,
  opts: NarrateOptions = {},
): Promise<StrategicResult> {
  const det = composeStrategic(exec, ops, pred);
  const report = await narrateHybrid(det.report, input, opts);
  return { ...det, report };
}

export const STRATEGIC_SECTION_COUNT = 12;

/** Invariante do composer: toda evidência composta existe numa origem. */
export function compositionInvariants(
  result: StrategicResult,
  sources: { exec: NarrativeReport | null; ops: OperationsNarrativeResult | null; pred: PredictiveNarrativeResult | null },
): string[] {
  const problems: string[] = [];
  const sourceEvidences = new Set<string>(['situacaoGeral.situacao']); // fallback declarativo
  const collect = (r: NarrativeReport | null) => {
    for (const sec of r?.secoes ?? []) for (const f of sec.frases) f.evidencias.forEach((e) => sourceEvidences.add(e));
    for (const m of r?.mudancas ?? []) m.evidencias.forEach((e) => sourceEvidences.add(e));
  };
  collect(sources.exec); collect(sources.ops?.report ?? null); collect(sources.pred?.report ?? null);
  for (const p of sources.ops?.priorities ?? []) p.evidencias.forEach((e) => sourceEvidences.add(e));
  for (const f of [...(sources.pred?.risks ?? []), ...(sources.pred?.opportunities ?? [])])
    f.evidencias.forEach((e) => sourceEvidences.add(e));

  for (const sec of result.report.secoes) {
    for (const f of sec.frases) {
      if (f.evidencias.length === 0) problems.push(`frase sem evidência em ${sec.key}`);
      for (const e of f.evidencias) {
        if (!sourceEvidences.has(e)) problems.push(`evidência "${e}" em ${sec.key} não existe nas origens`);
      }
    }
  }
  if (result.report.secoes.length !== STRATEGIC_SECTION_COUNT)
    problems.push(`esperadas ${STRATEGIC_SECTION_COUNT} seções, vieram ${result.report.secoes.length}`);
  return problems;
}
