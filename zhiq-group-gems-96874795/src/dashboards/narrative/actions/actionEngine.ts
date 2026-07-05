/**
 * M59.7 · Enterprise Action Intelligence — engine PURO.
 *
 * Transforma decisões APROVADAS/EM EXECUÇÃO (Decision Intelligence) em
 * planos estruturados de ação. A IA nunca decide o que executar: organiza,
 * acompanha e audita. Zero SQL; zero dataset; zero interpretação de dados.
 * Etapas derivadas SÓ de estruturas oficiais: a ação do runbook (descrição
 * da decisão) + 2 marcos reais da plataforma (validação no painel oficial
 * e registro do impacto observado na decisão de origem). Prazos NÃO são
 * modelados nesta fase — "ações atrasadas" declara a ausência em vez de
 * inventar deadlines.
 */

import type { Decision } from '../decisions/decisionEngine';
import type { NarratorOrigin } from '../narrators/strategicComposer';
import type { PriorityLevel } from '../narrators/operationsNarrator';

// ── Modelo oficial ────────────────────────────────────────────
export const ACTION_STATUSES = [
  'nao_iniciada', 'planejada', 'em_andamento', 'bloqueada',
  'em_validacao', 'concluida', 'cancelada',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export interface ActionStep {
  ordem: number;
  texto: string;
  /** marco (milestone) oficial */
  marco: boolean;
  concluida: boolean;
}

export interface Responsible {
  nome: string;
  funcao: string;
  atribuidoEm: string;
  status: 'ativo' | 'removido';
}

export interface ActionEvent {
  em: string;
  tipo: 'criada' | 'responsavel_atribuido' | 'responsavel_removido'
    | 'estado_alterado' | 'etapa_concluida' | 'concluida' | 'cancelada';
  de?: ActionStatus;
  para?: ActionStatus;
  detalhe?: string;
}

export interface ActionPlan {
  id: string;                  // act-<decisionId> (determinístico)
  decisaoId: string;
  objetivo: string;
  descricao: string;
  prioridade: PriorityLevel;
  urgencia: 'imediata' | 'curto_prazo' | 'planejada';
  impactoEsperado: string;
  origens: NarratorOrigin[];
  evidencias: string[];        // LITERAIS da decisão de origem
  etapas: ActionStep[];
  responsaveis: Responsible[];
  dependencias: string[];      // ids de outras AÇÕES (herdadas da decisão)
  status: ActionStatus;
  /** % = etapas concluídas / total (contagem presentacional) */
  progresso: number;
  criadaEm: string;
  atualizadaEm: string;
  timeline: ActionEvent[];
}

// ── Etapas oficiais (derivação declarada, nunca arbitrária) ──
export function deriveSteps(decision: Decision): ActionStep[] {
  return [
    { ordem: 1, texto: decision.descricao, marco: false, concluida: false },
    { ordem: 2, texto: 'Validar o resultado no painel oficial (Health Center / Alert Center).', marco: true, concluida: false },
    { ordem: 3, texto: 'Registrar o impacto observado na decisão de origem (Decision Intelligence).', marco: true, concluida: false },
  ];
}

// ── Criação (só de decisões aprovadas/em execução; idempotente) ──
const ELIGIBLE = ['aprovada', 'em_execucao'] as const;

export function createActionPlans(
  decisions: Decision[],
  existing: ActionPlan[],
  nowIso: string,
): ActionPlan[] {
  const known = new Set(existing.map((a) => a.id));
  const eligibleIds = new Set(
    decisions.filter((d) => (ELIGIBLE as readonly string[]).includes(d.status)).map((d) => d.id),
  );
  const created: ActionPlan[] = [];
  for (const d of decisions) {
    if (!eligibleIds.has(d.id)) continue;
    if (d.evidencias.length === 0) continue; // ação sem evidência NÃO existe
    const id = `act-${d.id}`;
    if (known.has(id)) continue;
    known.add(id);
    created.push({
      id,
      decisaoId: d.id,
      objetivo: d.titulo,
      descricao: d.descricao,
      prioridade: d.prioridade,
      urgencia: d.urgencia,
      impactoEsperado: d.impactoEsperado,
      origens: [...d.origens],
      evidencias: [...d.evidencias],
      etapas: deriveSteps(d),
      responsaveis: [],
      // dependências HERDADAS da decisão (só viram bloqueio se a ação existir)
      dependencias: d.dependencias.map((depId) => `act-${depId}`),
      status: 'nao_iniciada',
      progresso: 0,
      criadaEm: nowIso,
      atualizadaEm: nowIso,
      timeline: [{ em: nowIso, tipo: 'criada', detalhe: `da decisão ${d.id} (${d.origens.join('+')})` }],
    });
  }
  return [...existing, ...created];
}

// ── Máquina de estados (fixa; inválida ⇒ null) ────────────────
const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  nao_iniciada: ['planejada', 'cancelada'],
  planejada: ['em_andamento', 'bloqueada', 'cancelada'],
  em_andamento: ['bloqueada', 'em_validacao', 'cancelada'],
  bloqueada: ['planejada', 'em_andamento', 'cancelada'],
  em_validacao: ['concluida', 'em_andamento', 'cancelada'],
  concluida: [],
  cancelada: [],
};

export function canTransitionAction(from: ActionStatus, to: ActionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedActionTransitions(from: ActionStatus): ActionStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function transitionAction(
  a: ActionPlan,
  to: ActionStatus,
  nowIso: string,
  detalhe?: string,
): ActionPlan | null {
  if (!canTransitionAction(a.status, to)) return null;
  const tipo: ActionEvent['tipo'] =
    to === 'concluida' ? 'concluida' : to === 'cancelada' ? 'cancelada' : 'estado_alterado';
  return {
    ...a,
    status: to,
    atualizadaEm: nowIso,
    timeline: [...a.timeline, { em: nowIso, tipo, de: a.status, para: to, detalhe }],
  };
}

// ── Progresso por etapas (checklist auditável) ────────────────
export function completeStep(a: ActionPlan, ordem: number, nowIso: string): ActionPlan | null {
  const step = a.etapas.find((e) => e.ordem === ordem);
  if (!step || step.concluida) return null;
  if (['concluida', 'cancelada'].includes(a.status)) return null;
  const etapas = a.etapas.map((e) => (e.ordem === ordem ? { ...e, concluida: true } : e));
  const progresso = Math.round((etapas.filter((e) => e.concluida).length / etapas.length) * 100);
  return {
    ...a,
    etapas,
    progresso,
    atualizadaEm: nowIso,
    timeline: [...a.timeline, {
      em: nowIso, tipo: 'etapa_concluida',
      detalhe: `etapa ${ordem}${step.marco ? ' (MARCO atingido)' : ''}: ${step.texto.slice(0, 60)} · progresso ${progresso}%`,
    }],
  };
}

// ── Responsáveis (a IA só organiza) ───────────────────────────
export function assignResponsible(
  a: ActionPlan,
  r: { nome: string; funcao: string },
  nowIso: string,
): ActionPlan {
  return {
    ...a,
    responsaveis: [...a.responsaveis, { ...r, atribuidoEm: nowIso, status: 'ativo' }],
    atualizadaEm: nowIso,
    timeline: [...a.timeline, { em: nowIso, tipo: 'responsavel_atribuido', detalhe: `${r.nome} (${r.funcao})` }],
  };
}

export function removeResponsible(a: ActionPlan, nome: string, nowIso: string): ActionPlan {
  return {
    ...a,
    responsaveis: a.responsaveis.map((r) =>
      r.nome === nome && r.status === 'ativo' ? { ...r, status: 'removido' } : r),
    atualizadaEm: nowIso,
    timeline: [...a.timeline, { em: nowIso, tipo: 'responsavel_removido', detalhe: nome }],
  };
}

// ── Dependências (visão do grafo) ─────────────────────────────
export function actionDependencyView(actions: ActionPlan[]): {
  bloqueadas: ActionPlan[]; desbloqueadas: ActionPlan[]; independentes: ActionPlan[];
} {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const active = actions.filter((a) => !['concluida', 'cancelada'].includes(a.status));
  const bloqueadas: ActionPlan[] = [];
  const desbloqueadas: ActionPlan[] = [];
  const independentes: ActionPlan[] = [];
  for (const a of active) {
    const realDeps = a.dependencias.filter((id) => byId.has(id)); // só dependências com ação existente
    if (realDeps.length === 0) { independentes.push(a); continue; }
    const pending = realDeps.filter((id) => byId.get(id)!.status !== 'concluida');
    (pending.length > 0 ? bloqueadas : desbloqueadas).push(a);
  }
  return { bloqueadas, desbloqueadas, independentes };
}

// ── Snapshot Engine (append-only) ─────────────────────────────
export interface ActionSnapshot {
  em: string;
  total: number;
  porStatus: Record<ActionStatus, number>;
  abertas: number;
  emAndamento: number;
  bloqueadas: number;
  concluidas: number;
  /** média das % oficiais de progresso (agregação presentacional declarada) */
  progressoMedio: number | null;
  marcosAtingidos: number;
  /** prazos não são modelados nesta fase — declarado, nunca inventado */
  atrasadas: 'nao_modelado';
}

export function takeActionSnapshot(actions: ActionPlan[], nowIso: string): ActionSnapshot {
  const porStatus = Object.fromEntries(ACTION_STATUSES.map((s) => [s, 0])) as Record<ActionStatus, number>;
  for (const a of actions) porStatus[a.status]++;
  const active = actions.filter((a) => !['concluida', 'cancelada'].includes(a.status));
  return {
    em: nowIso,
    total: actions.length,
    porStatus,
    abertas: active.length,
    emAndamento: porStatus.em_andamento,
    bloqueadas: porStatus.bloqueada,
    concluidas: porStatus.concluida,
    progressoMedio: actions.length
      ? Math.round(actions.reduce((s, a) => s + a.progresso, 0) / actions.length)
      : null,
    marcosAtingidos: actions.reduce(
      (s, a) => s + a.etapas.filter((e) => e.marco && e.concluida).length, 0),
    atrasadas: 'nao_modelado',
  };
}

export function compareActionSnapshots(prev: ActionSnapshot | null, cur: ActionSnapshot): string[] {
  if (!prev) return ['Primeira execução registrada do ciclo de ações.'];
  const out: string[] = [];
  if (prev.total !== cur.total) out.push(`ações: ${prev.total} → ${cur.total}.`);
  if (prev.concluidas !== cur.concluidas) out.push(`concluídas: ${prev.concluidas} → ${cur.concluidas}.`);
  if (prev.bloqueadas !== cur.bloqueadas) out.push(`bloqueadas: ${prev.bloqueadas} → ${cur.bloqueadas}.`);
  if (prev.progressoMedio !== cur.progressoMedio)
    out.push(`progresso médio: ${prev.progressoMedio ?? '—'}% → ${cur.progressoMedio ?? '—'}%.`);
  if (prev.marcosAtingidos !== cur.marcosAtingidos)
    out.push(`marcos atingidos: ${prev.marcosAtingidos} → ${cur.marcosAtingidos}.`);
  return out.length ? out : ['Sem mudanças na execução desde o último snapshot.'];
}

// ── Invariantes (self-test) ───────────────────────────────────
export function actionInvariants(actions: ActionPlan[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const a of actions) {
    if (ids.has(a.id)) problems.push(`id duplicado: ${a.id}`);
    ids.add(a.id);
    if (a.evidencias.length === 0) problems.push(`ação sem evidência: ${a.id}`);
    if (!ACTION_STATUSES.includes(a.status)) problems.push(`status inválido: ${a.status}`);
    if (a.timeline.length === 0 || a.timeline[0].tipo !== 'criada')
      problems.push(`timeline sem criação: ${a.id}`);
    if (a.etapas.length < 3 || a.etapas.filter((e) => e.marco).length < 2)
      problems.push(`plano sem etapas/marcos oficiais: ${a.id}`);
    const pct = Math.round((a.etapas.filter((e) => e.concluida).length / a.etapas.length) * 100);
    if (pct !== a.progresso) problems.push(`progresso divergente das etapas: ${a.id}`);
    if (!a.decisaoId) problems.push(`ação sem decisão de origem: ${a.id}`);
  }
  return problems;
}
