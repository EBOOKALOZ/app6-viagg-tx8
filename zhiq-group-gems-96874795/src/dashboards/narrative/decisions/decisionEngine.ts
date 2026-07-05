/**
 * M59.6 · Enterprise Decision Intelligence — engine PURO.
 *
 * A IA NUNCA decide pelo CEO: esta camada organiza, acompanha e audita o
 * ciclo de vida das decisões derivadas EXCLUSIVAMENTE dos
 * StrategicDecision[] do M59.5. Zero SQL; zero dataset novo; zero
 * interpretação de dados. Toda decisão nasce com evidências das origens e
 * trilha completa de alterações (timeline imutável — eventos só são
 * acrescentados; snapshots anteriores jamais mudam).
 */

import type { StrategicResult, StrategicDecision, NarratorOrigin } from '../narrators/strategicComposer';
import type { PriorityLevel } from '../narrators/operationsNarrator';

// ── Modelo oficial ────────────────────────────────────────────
export const DECISION_STATUSES = [
  'pendente', 'em_analise', 'aprovada', 'adiada',
  'rejeitada', 'em_execucao', 'concluida', 'cancelada',
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type ImpactSituation = 'confirmado' | 'parcialmente_confirmado' | 'inconclusivo' | 'nao_confirmado';

export interface DecisionEvent {
  em: string;
  tipo: 'criada' | 'estado_alterado' | 'impacto_registrado';
  de?: DecisionStatus;
  para?: DecisionStatus;
  detalhe?: string;
}

export interface Decision {
  id: string;
  titulo: string;
  descricao: string;
  impactoEsperado: string;
  prioridade: PriorityLevel;
  urgencia: 'imediata' | 'curto_prazo' | 'planejada';
  dependencias: string[];      // ids de outras decisões
  origens: NarratorOrigin[];
  evidencias: string[];
  status: DecisionStatus;
  criadaEm: string;
  atualizadaEm: string;
  timeline: DecisionEvent[];
  impactoObservado?: {
    descricao: string;
    situacao: ImpactSituation;
    registradoEm: string;
  };
}

// ── Id determinístico (mesma decisão estratégica ⇒ mesmo id) ──
export function decisionId(d: StrategicDecision): string {
  const src = `${d.decisao}|${d.origens.join(',')}`;
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) >>> 0;
  return `dec-${h.toString(16)}`;
}

// ── Máquina de estados (transições FIXAS — jamais estados extras) ──
const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  pendente: ['em_analise', 'aprovada', 'adiada', 'rejeitada'],
  em_analise: ['aprovada', 'adiada', 'rejeitada', 'pendente'],
  aprovada: ['em_execucao', 'adiada', 'cancelada'],
  adiada: ['pendente', 'em_analise', 'cancelada'],
  rejeitada: [],
  em_execucao: ['concluida', 'cancelada'],
  concluida: [],
  cancelada: [],
};

export function canTransition(from: DecisionStatus, to: DecisionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: DecisionStatus): DecisionStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Transição auditada: retorna NOVA decisão (imutabilidade); inválida ⇒ null. */
export function transitionDecision(
  d: Decision,
  to: DecisionStatus,
  nowIso: string,
  detalhe?: string,
): Decision | null {
  if (!canTransition(d.status, to)) return null;
  return {
    ...d,
    status: to,
    atualizadaEm: nowIso,
    timeline: [...d.timeline, { em: nowIso, tipo: 'estado_alterado', de: d.status, para: to, detalhe }],
  };
}

// ── Ingestão (idempotente e determinística) ───────────────────
/** Converte StrategicDecision[] em decisões PENDENTES; ids já existentes
 *  não são recriados nem duplicados. Dependência REAL única derivável:
 *  correção de catálogo reprovado bloqueia as demais (números não são
 *  confiáveis até lá) — nenhuma dependência artificial é criada. */
export function ingestStrategicDecisions(
  strategic: StrategicResult,
  existing: Decision[],
  nowIso: string,
): Decision[] {
  const known = new Set(existing.map((d) => d.id));
  const created: Decision[] = [];
  const priByIndex = strategic.priorities;

  for (let i = 0; i < strategic.decisions.length; i++) {
    const sd = strategic.decisions[i];
    if (sd.evidencias.length === 0) continue; // decisão sem evidência NÃO existe
    const id = decisionId(sd);
    if (known.has(id)) continue;
    known.add(id);
    const pri = priByIndex[i];
    created.push({
      id,
      titulo: pri?.titulo ?? sd.decisao.slice(0, 80),
      descricao: sd.decisao,
      impactoEsperado: sd.impactoEsperado,
      prioridade: pri?.nivel ?? 'media',
      urgencia: pri?.urgencia ?? 'planejada',
      dependencias: [],
      origens: sd.origens,
      evidencias: [...sd.evidencias],
      status: 'pendente',
      criadaEm: nowIso,
      atualizadaEm: nowIso,
      timeline: [{ em: nowIso, tipo: 'criada', detalhe: `origem: ${sd.origens.join('+')}` }],
    });
  }

  const all = [...existing, ...created];
  // dependência doutrinária: catálogo reprovado bloqueia o resto
  const catalogFix = all.find((d) => d.evidencias.includes('governanca.catalogoAprovado') &&
    /catálogo|catalogo/i.test(d.titulo + d.descricao));
  if (catalogFix) {
    for (const d of all) {
      if (d.id !== catalogFix.id && !d.dependencias.includes(catalogFix.id) &&
          !['concluida', 'cancelada', 'rejeitada'].includes(d.status)) {
        d.dependencias = [...d.dependencias, catalogFix.id];
      }
    }
  }
  return all;
}

// ── Grafo de dependências ─────────────────────────────────────
export interface DependencyView {
  bloqueadas: Decision[];
  desbloqueadas: Decision[];
  independentes: Decision[];
}

const DONE: DecisionStatus[] = ['concluida', 'cancelada', 'rejeitada'];

export function dependencyView(decisions: Decision[]): DependencyView {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const active = decisions.filter((d) => !DONE.includes(d.status));
  const bloqueadas: Decision[] = [];
  const desbloqueadas: Decision[] = [];
  const independentes: Decision[] = [];
  for (const d of active) {
    if (d.dependencias.length === 0) {
      independentes.push(d);
      continue;
    }
    const pendingDeps = d.dependencias.filter((id) => {
      const dep = byId.get(id);
      return dep && dep.status !== 'concluida';
    });
    (pendingDeps.length > 0 ? bloqueadas : desbloqueadas).push(d);
  }
  return { bloqueadas, desbloqueadas, independentes };
}

// ── Avaliação de impacto (só organiza; nunca julga sem evidência) ──
export function registerObservedImpact(
  d: Decision,
  impacto: { descricao: string; situacao: ImpactSituation },
  nowIso: string,
): Decision | null {
  if (d.status !== 'concluida') return null; // impacto observado exige conclusão
  return {
    ...d,
    atualizadaEm: nowIso,
    impactoObservado: { ...impacto, registradoEm: nowIso },
    timeline: [...d.timeline, {
      em: nowIso, tipo: 'impacto_registrado',
      detalhe: `${impacto.situacao}: ${impacto.descricao}`,
    }],
  };
}

// ── Snapshot Engine (append-only; snapshots anteriores intocáveis) ──
export interface DecisionSnapshot {
  em: string;
  total: number;
  porStatus: Record<DecisionStatus, number>;
  abertas: number;      // não-terminais
  concluidas: number;
  adiadas: number;
  canceladas: number;
  impactosConfirmados: number;
}

export function takeDecisionSnapshot(decisions: Decision[], nowIso: string): DecisionSnapshot {
  const porStatus = Object.fromEntries(DECISION_STATUSES.map((s) => [s, 0])) as Record<DecisionStatus, number>;
  for (const d of decisions) porStatus[d.status]++;
  return {
    em: nowIso,
    total: decisions.length,
    porStatus,
    abertas: decisions.filter((d) => !DONE.includes(d.status)).length,
    concluidas: porStatus.concluida,
    adiadas: porStatus.adiada,
    canceladas: porStatus.cancelada,
    impactosConfirmados: decisions.filter((d) => d.impactoObservado?.situacao === 'confirmado').length,
  };
}

export function compareDecisionSnapshots(
  prev: DecisionSnapshot | null,
  cur: DecisionSnapshot,
): string[] {
  if (!prev) return ['Primeira execução registrada do ciclo de decisões.'];
  const out: string[] = [];
  if (prev.total !== cur.total) out.push(`decisões: ${prev.total} → ${cur.total}.`);
  if (prev.abertas !== cur.abertas) out.push(`abertas: ${prev.abertas} → ${cur.abertas}.`);
  if (prev.concluidas !== cur.concluidas) out.push(`concluídas: ${prev.concluidas} → ${cur.concluidas}.`);
  if (prev.adiadas !== cur.adiadas) out.push(`adiadas: ${prev.adiadas} → ${cur.adiadas}.`);
  if (prev.impactosConfirmados !== cur.impactosConfirmados)
    out.push(`impactos confirmados: ${prev.impactosConfirmados} → ${cur.impactosConfirmados}.`);
  return out.length ? out : ['Sem mudanças no ciclo de decisões desde o último snapshot.'];
}

// ── Invariantes (self-test) ───────────────────────────────────
export function decisionInvariants(decisions: Decision[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const d of decisions) {
    if (ids.has(d.id)) problems.push(`id duplicado: ${d.id}`);
    ids.add(d.id);
    if (d.evidencias.length === 0) problems.push(`decisão sem evidência: ${d.id}`);
    if (!DECISION_STATUSES.includes(d.status)) problems.push(`status inválido: ${d.status}`);
    if (d.timeline.length === 0 || d.timeline[0].tipo !== 'criada')
      problems.push(`timeline sem evento de criação: ${d.id}`);
    if (d.impactoObservado && d.status !== 'concluida')
      problems.push(`impacto observado sem conclusão: ${d.id}`);
    for (const dep of d.dependencias) {
      if (dep === d.id) problems.push(`auto-dependência: ${d.id}`);
    }
  }
  return problems;
}
