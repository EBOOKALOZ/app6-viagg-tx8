/**
 * M59.8 · Enterprise Execution Intelligence — COMPOSER final do ciclo.
 *
 * Compõe Decision → Action → Snapshot → Impacto numa visão única:
 * "o que foi planejado, o que foi executado, quais resultados e qual o
 * estado real da execução estratégica". Zero SQL; zero recompute; zero
 * interpretação de datasets; nada de origem é modificado; toda conclusão
 * preserva as evidências. Impacto ainda não avaliado é DECLARADO:
 * "Aguardando avaliação oficial."
 */

import type { Decision, DecisionSnapshot } from '../decisions/decisionEngine';
import type { ActionPlan, ActionSnapshot } from '../actions/actionEngine';
import type { NarrativeReportSection, NarrativeSentence } from '../narrators/executiveDeterministic';

const s = (texto: string, ...evidencias: string[]): NarrativeSentence => ({ texto, evidencias });
const AGUARDANDO_AVALIACAO = 'Aguardando avaliação oficial.';
const EV_FALLBACK = 'situacaoGeral.situacao';

// ── Comparação planejado × executado (por ação) ───────────────
export interface ExecutionComparison {
  acaoId: string;
  decisaoId: string;
  objetivo: string;
  estado: string;
  progresso: number;
  impactoEsperado: string;
  impactoObservado: string;          // ou "Aguardando avaliação oficial."
  situacaoImpacto: string | null;    // confirmado/parcialmente/inconclusivo/nao_confirmado
  origens: string[];
  evidencias: string[];              // união decisão+ação (preservadas)
}

export function buildComparisons(decisions: Decision[], actions: ActionPlan[]): ExecutionComparison[] {
  const decById = new Map(decisions.map((d) => [d.id, d]));
  return actions.map((a) => {
    const d = decById.get(a.decisaoId) ?? null;
    return {
      acaoId: a.id,
      decisaoId: a.decisaoId,
      objetivo: a.objetivo,
      estado: a.status,
      progresso: a.progresso,
      impactoEsperado: a.impactoEsperado,
      impactoObservado: d?.impactoObservado?.descricao ?? AGUARDANDO_AVALIACAO,
      situacaoImpacto: d?.impactoObservado?.situacao ?? null,
      origens: [...a.origens],
      evidencias: [...new Set([...(d?.evidencias ?? []), ...a.evidencias])],
    };
  });
}

// ── Divergências (declaradas, nunca julgadas sem evidência) ───
export interface ExecutionDivergence {
  acaoId: string;
  tipo: 'impacto_nao_confirmado' | 'impacto_parcial' | 'acao_cancelada_de_decisao_aprovada';
  detalhe: string;
  evidencias: string[];
}

export function detectExecutionDivergences(
  decisions: Decision[],
  comparisons: ExecutionComparison[],
): ExecutionDivergence[] {
  const decById = new Map(decisions.map((d) => [d.id, d]));
  const out: ExecutionDivergence[] = [];
  for (const c of comparisons) {
    if (c.situacaoImpacto === 'nao_confirmado') {
      out.push({
        acaoId: c.acaoId, tipo: 'impacto_nao_confirmado',
        detalhe: `esperado "${c.impactoEsperado}" × observado "${c.impactoObservado}" (não confirmado pela avaliação oficial)`,
        evidencias: c.evidencias,
      });
    } else if (c.situacaoImpacto === 'parcialmente_confirmado') {
      out.push({
        acaoId: c.acaoId, tipo: 'impacto_parcial',
        detalhe: `impacto parcialmente confirmado: "${c.impactoObservado}"`,
        evidencias: c.evidencias,
      });
    }
    const d = decById.get(c.decisaoId);
    if (c.estado === 'cancelada' && d && ['aprovada', 'em_execucao', 'concluida'].includes(d.status)) {
      out.push({
        acaoId: c.acaoId, tipo: 'acao_cancelada_de_decisao_aprovada',
        detalhe: `a ação foi cancelada, mas a decisão ${d.id} segue "${d.status}" — divergência declarada`,
        evidencias: c.evidencias,
      });
    }
  }
  return out;
}

// ── Indicadores oficiais (contagens presentacionais) ──────────
export interface ExecutionIndicators {
  decisoesTotais: number;
  acoesCriadas: number;
  acoesConcluidas: number;
  acoesBloqueadas: number;
  progressoMedio: number | null;
  marcosConcluidos: number;
  impactosConfirmados: number;
  impactosParciais: number;
  impactosInconclusivos: number;
  aguardandoAvaliacao: number;
}

export function buildIndicators(decisions: Decision[], actions: ActionPlan[]): ExecutionIndicators {
  const withImpact = decisions.filter((d) => d.impactoObservado);
  return {
    decisoesTotais: decisions.length,
    acoesCriadas: actions.length,
    acoesConcluidas: actions.filter((a) => a.status === 'concluida').length,
    acoesBloqueadas: actions.filter((a) => a.status === 'bloqueada').length,
    progressoMedio: actions.length
      ? Math.round(actions.reduce((sum, a) => sum + a.progresso, 0) / actions.length)
      : null,
    marcosConcluidos: actions.reduce(
      (sum, a) => sum + a.etapas.filter((e) => e.marco && e.concluida).length, 0),
    impactosConfirmados: withImpact.filter((d) => d.impactoObservado!.situacao === 'confirmado').length,
    impactosParciais: withImpact.filter((d) => d.impactoObservado!.situacao === 'parcialmente_confirmado').length,
    impactosInconclusivos: withImpact.filter((d) => d.impactoObservado!.situacao === 'inconclusivo').length,
    aguardandoAvaliacao: actions.filter((a) => {
      const d = decisions.find((x) => x.id === a.decisaoId);
      return !d?.impactoObservado;
    }).length,
  };
}

// ── As 15 seções ──────────────────────────────────────────────
export interface ExecutionResult {
  secoes: NarrativeReportSection[];
  comparisons: ExecutionComparison[];
  divergencias: ExecutionDivergence[];
  indicadores: ExecutionIndicators;
  /** timeline consolidada (decisões + ações; presentacional, mais novos primeiro) */
  timelineConsolidada: { em: string; origem: string; texto: string }[];
  composicaoMs: number | null;
  geradoEm: string;
}

function evOf(c: ExecutionComparison): string[] {
  return c.evidencias.length ? c.evidencias : [EV_FALLBACK];
}

export function composeExecution(
  decisions: Decision[],
  actions: ActionPlan[],
  nowIso: string,
  _decisionSnapshots: DecisionSnapshot[] = [],
  _actionSnapshots: ActionSnapshot[] = [],
): ExecutionResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const comparisons = buildComparisons(decisions, actions);
  const divergencias = detectExecutionDivergences(decisions, comparisons);
  const ind = buildIndicators(decisions, actions);

  const semDecisoes = decisions.length === 0;
  const semAcoes = actions.length === 0;

  // situação geral (classificação sobre contagens oficiais)
  const situacao =
    semDecisoes ? 'AGUARDANDO: nenhuma decisão registrada — o ciclo começa na aba Decision Intelligence.'
    : semAcoes ? 'PLANEJAMENTO: decisões registradas, mas nenhum plano de ação gerado ainda.'
    : ind.acoesBloqueadas > 0 ? `ATENÇÃO: ${ind.acoesBloqueadas} ação(ões) bloqueada(s) por dependência.`
    : ind.acoesConcluidas === ind.acoesCriadas && ind.impactosConfirmados > 0
      ? 'EXECUTADA: todas as ações concluídas com impactos confirmados.'
    : 'EM CURSO: execução em andamento dentro do fluxo oficial.';

  const recomendacoes: NarrativeSentence[] = [];
  if (semDecisoes) recomendacoes.push(s('Aprovar decisões na aba Decision Intelligence para iniciar o ciclo.', EV_FALLBACK));
  if (!semDecisoes && semAcoes) recomendacoes.push(s('Gerar os planos de ação das decisões aprovadas (Action Intelligence).', EV_FALLBACK));
  if (ind.acoesBloqueadas > 0)
    recomendacoes.push(s(`Concluir as dependências que bloqueiam ${ind.acoesBloqueadas} ação(ões) — ver grafo na aba Action Intelligence.`,
      ...(actions.find((a) => a.status === 'bloqueada')?.evidencias ?? [EV_FALLBACK])));
  if (ind.aguardandoAvaliacao > 0)
    recomendacoes.push(s(`Registrar o impacto observado de ${ind.aguardandoAvaliacao} ação(ões)/decisão(ões) — sem avaliação oficial não há resultado declarável.`, EV_FALLBACK));
  if (recomendacoes.length === 0)
    recomendacoes.push(s('Ciclo saudável: manter acompanhamento pelos snapshots.', EV_FALLBACK));

  const cmpFrases = (filter: (c: ExecutionComparison) => boolean, vazio: string): NarrativeSentence[] => {
    const list = comparisons.filter(filter);
    return list.length === 0
      ? [s(vazio, EV_FALLBACK)]
      : list.map((c) => s(
          `${c.objetivo} [${c.estado} · ${c.progresso}%] — esperado: ${c.impactoEsperado}; observado: ${c.impactoObservado}${c.situacaoImpacto ? ` (${c.situacaoImpacto})` : ''}.`,
          ...evOf(c)));
  };

  const secoes: NarrativeReportSection[] = [
    { key: 'resumo', titulo: 'Resumo da Execução',
      frases: [s(`${ind.decisoesTotais} decisão(ões), ${ind.acoesCriadas} plano(s) de ação, ${ind.acoesConcluidas} concluído(s), progresso médio ${ind.progressoMedio ?? '—'}%, ${ind.marcosConcluidos} marco(s) atingido(s).`, EV_FALLBACK)] },
    { key: 'decisoes', titulo: 'Decisões Planejadas',
      frases: semDecisoes
        ? [s('Nenhuma decisão registrada.', EV_FALLBACK)]
        : decisions.map((d) => s(`${d.titulo} [${d.status}] — ${d.impactoEsperado}.`, ...d.evidencias)) },
    { key: 'acoes', titulo: 'Ações Executadas',
      frases: cmpFrases(() => true, 'Nenhum plano de ação criado.') },
    { key: 'progresso', titulo: 'Progresso Geral',
      frases: [s(`Progresso médio oficial: ${ind.progressoMedio ?? '— (sem ações)'}%.`, EV_FALLBACK)] },
    { key: 'marcos', titulo: 'Marcos Concluídos',
      frases: [s(ind.marcosConcluidos === 0
        ? 'Nenhum marco atingido ainda.'
        : `${ind.marcosConcluidos} marco(s) oficial(is) atingido(s) (validação em painel e/ou registro de impacto).`, EV_FALLBACK)] },
    { key: 'bloqueadas', titulo: 'Ações Bloqueadas',
      frases: cmpFrases((c) => c.estado === 'bloqueada', 'Nenhuma ação bloqueada.') },
    { key: 'dependencias', titulo: 'Dependências Ativas',
      frases: (() => {
        const deps = actions.filter((a) => a.dependencias.length > 0 && !['concluida', 'cancelada'].includes(a.status));
        return deps.length === 0
          ? [s('Sem dependências ativas entre ações.', EV_FALLBACK)]
          : deps.map((a) => s(`${a.objetivo} depende de: ${a.dependencias.join(', ')}.`, ...a.evidencias));
      })() },
    { key: 'impactosEsperados', titulo: 'Impactos Esperados',
      frases: semAcoes ? [s('Sem ações — sem impactos esperados a acompanhar.', EV_FALLBACK)]
        : comparisons.map((c) => s(`${c.objetivo}: ${c.impactoEsperado}.`, ...evOf(c))) },
    { key: 'impactosObservados', titulo: 'Impactos Observados',
      frases: semAcoes ? [s('Sem ações — nada a observar ainda.', EV_FALLBACK)]
        : comparisons.map((c) => s(`${c.objetivo}: ${c.impactoObservado}${c.situacaoImpacto ? ` (${c.situacaoImpacto})` : ''}.`, ...evOf(c))) },
    { key: 'divergencias', titulo: 'Divergências',
      frases: divergencias.length === 0
        ? [s('Nenhuma divergência entre planejado e executado.', EV_FALLBACK)]
        : divergencias.map((d) => s(`DIVERGÊNCIA (${d.tipo}): ${d.detalhe}`, ...d.evidencias)) },
    { key: 'confirmados', titulo: 'Resultados Confirmados',
      frases: cmpFrases((c) => c.situacaoImpacto === 'confirmado', 'Nenhum resultado confirmado pela avaliação oficial ainda.') },
    { key: 'inconclusivos', titulo: 'Resultados Inconclusivos',
      frases: cmpFrases((c) => c.situacaoImpacto === 'inconclusivo', 'Nenhum resultado inconclusivo registrado.') },
    { key: 'situacao', titulo: 'Situação Geral da Execução',
      frases: [s(situacao, EV_FALLBACK)] },
    { key: 'recomendacoes', titulo: 'Recomendações de Continuidade', frases: recomendacoes },
    { key: 'conclusao', titulo: 'Conclusão',
      frases: [s(semDecisoes
        ? 'Conclusão: ciclo de execução aguardando as primeiras decisões do CEO.'
        : `Conclusão: execução ${ind.acoesConcluidas}/${ind.acoesCriadas} concluída(s); ${ind.impactosConfirmados} impacto(s) confirmado(s); continuar pelo fluxo oficial Decision → Action → Impacto.`, EV_FALLBACK)] },
  ];

  // timeline consolidada (presentacional; origens intactas)
  const timelineConsolidada = [
    ...decisions.flatMap((d) => d.timeline.map((e) => ({
      em: e.em, origem: `decisão ${d.id}`, texto: `${e.tipo}${e.para ? ` → ${e.para}` : ''}${e.detalhe ? ` · ${e.detalhe}` : ''}`,
    }))),
    ...actions.flatMap((a) => a.timeline.map((e) => ({
      em: e.em, origem: `ação ${a.id}`, texto: `${e.tipo}${e.para ? ` → ${e.para}` : ''}${e.detalhe ? ` · ${e.detalhe}` : ''}`,
    }))),
  ].sort((x, y) => (x.em < y.em ? 1 : -1)).slice(0, 30);

  const composicaoMs =
    typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 100) / 100 : null;

  return { secoes, comparisons, divergencias, indicadores: ind, timelineConsolidada, composicaoMs, geradoEm: nowIso };
}

export const EXECUTION_SECTION_COUNT = 15;

/** Invariantes: 15 seções; toda frase com evidência; comparações preservam origens. */
export function executionInvariants(
  result: ExecutionResult,
  decisions: Decision[],
  actions: ActionPlan[],
): string[] {
  const problems: string[] = [];
  if (result.secoes.length !== EXECUTION_SECTION_COUNT)
    problems.push(`esperadas ${EXECUTION_SECTION_COUNT} seções, vieram ${result.secoes.length}`);
  for (const sec of result.secoes) {
    if (sec.frases.length === 0) problems.push(`seção vazia: ${sec.key}`);
    for (const f of sec.frases) if (f.evidencias.length === 0) problems.push(`frase sem evidência em ${sec.key}`);
  }
  const decById = new Map(decisions.map((d) => [d.id, d]));
  const actById = new Map(actions.map((a) => [a.id, a]));
  for (const c of result.comparisons) {
    const d = decById.get(c.decisaoId);
    const a = actById.get(c.acaoId);
    if (!a) { problems.push(`comparação sem ação: ${c.acaoId}`); continue; }
    for (const e of c.evidencias) {
      if (!(d?.evidencias.includes(e) || a.evidencias.includes(e)))
        problems.push(`evidência "${e}" não existe nas origens de ${c.acaoId}`);
    }
  }
  return problems;
}
