/**
 * M59.7 · Action Intelligence — 6ª aba do painel narrativo.
 * Planos de execução das decisões APROVADAS/EM EXECUÇÃO: etapas/checklist,
 * marcos, responsáveis, progresso, dependências, timeline e evidências.
 * A IA organiza e acompanha; nunca decide. Persistência local; snapshots
 * append-only. Prazos não são modelados — declarado, nunca inventado.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { typography, borders } from '../../core/tokens';
import { StatusBadge, ProgressIndicator } from '../../components/indicators';
import { EmptyState } from '../../components/feedback';
import type { Decision } from '../decisions/decisionEngine';
import {
  type ActionPlan, type ActionSnapshot, type ActionStatus,
  createActionPlans, transitionAction, allowedActionTransitions, completeStep,
  assignResponsible, actionDependencyView, takeActionSnapshot,
  compareActionSnapshots, actionInvariants,
} from './actionEngine';

const STORE_KEY = 'viagg.actions.v1';
const DECISIONS_KEY = 'viagg.decisions.v1';

interface ActionStore { actions: ActionPlan[]; snapshots: ActionSnapshot[] }

function loadActions(): ActionStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as ActionStore;
  } catch { /* recomeça vazio */ }
  return { actions: [], snapshots: [] };
}

function loadDecisions(): Decision[] {
  try {
    const raw = localStorage.getItem(DECISIONS_KEY);
    if (raw) return (JSON.parse(raw) as { decisions: Decision[] }).decisions ?? [];
  } catch { /* sem decisões */ }
  return [];
}

const STATUS_BADGE: Record<ActionStatus, { state: 'bom' | 'atencao' | 'critico' | 'alto' | 'offline' | 'excelente'; label: string }> = {
  nao_iniciada: { state: 'offline', label: 'Não iniciada' },
  planejada: { state: 'atencao', label: 'Planejada' },
  em_andamento: { state: 'bom', label: 'Em andamento' },
  bloqueada: { state: 'critico', label: 'Bloqueada' },
  em_validacao: { state: 'alto', label: 'Em validação' },
  concluida: { state: 'excelente', label: 'Concluída' },
  cancelada: { state: 'offline', label: 'Cancelada' },
};

export function ActionPanel() {
  const [store, setStore] = useState<ActionStore>(() => loadActions());
  const [showEvidence, setShowEvidence] = useState(false);
  const [respDrafts, setRespDrafts] = useState<Record<string, { nome: string; funcao: string }>>({});

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* indisponível */ }
  }, [store]);

  const importPlans = () => {
    const decisions = loadDecisions();
    setStore((s) => {
      const actions = createActionPlans(decisions, s.actions, new Date().toISOString());
      const snap = takeActionSnapshot(actions, new Date().toISOString());
      return { actions, snapshots: [...s.snapshots, snap] }; // append-only
    });
  };

  const update = (id: string, fn: (a: ActionPlan) => ActionPlan | null) => {
    setStore((s) => ({
      ...s,
      actions: s.actions.map((a) => (a.id === id ? (fn(a) ?? a) : a)),
    }));
  };

  const deps = useMemo(() => actionDependencyView(store.actions), [store.actions]);
  const blockedIds = useMemo(() => new Set(deps.bloqueadas.map((a) => a.id)), [deps]);
  const problems = useMemo(() => actionInvariants(store.actions), [store.actions]);
  const lastSnap = store.snapshots[store.snapshots.length - 1] ?? null;
  const prevSnap = store.snapshots[store.snapshots.length - 2] ?? null;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={typography.cardSubtitle}>
          Planos derivados SÓ de decisões <b>aprovadas/em execução</b>; etapas = ação oficial do
          runbook + 2 marcos reais da plataforma. Prazos não são modelados nesta fase (declarado).
          {problems.length > 0 && ` ⚠ invariantes: ${problems[0]}`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={importPlans}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
            Gerar planos das decisões aprovadas
          </button>
          <button type="button" onClick={() => setShowEvidence((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
            {showEvidence ? 'Ocultar evidências' : 'Mostrar evidências'}
          </button>
        </div>
      </div>

      {/* Indicadores oficiais */}
      {lastSnap && (
        <div className={`${borders.radiusSm} ${borders.edge} bg-card p-3 text-xs`}>
          <span className={typography.mono}>
            total {lastSnap.total} · abertas {lastSnap.abertas} · em andamento {lastSnap.emAndamento} ·
            bloqueadas {lastSnap.bloqueadas} · concluídas {lastSnap.concluidas} ·
            progresso médio {lastSnap.progressoMedio ?? '—'}% · marcos {lastSnap.marcosAtingidos} ·
            atrasadas: — (prazo não modelado)
          </span>
          <p className="mt-1 text-muted-foreground">{compareActionSnapshots(prevSnap, lastSnap).join(' ')}</p>
        </div>
      )}

      {store.actions.length === 0 ? (
        <EmptyState
          title="Nenhum plano de ação"
          description='Aprove decisões na aba Decision Intelligence e use "Gerar planos das decisões aprovadas".'
        />
      ) : (
        <div className="space-y-2">
          {store.actions.map((a) => (
            <div key={a.id} className={`${borders.radius} ${borders.edge} bg-card p-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge state={STATUS_BADGE[a.status].state} label={STATUS_BADGE[a.status].label} />
                {blockedIds.has(a.id) && <StatusBadge state="critico" label="DEPENDÊNCIA PENDENTE" />}
                <p className="text-xs font-semibold">{a.objetivo}</p>
                <span className={`${typography.mono} text-[10px] text-muted-foreground`}>{a.id}</span>
              </div>
              <p className={`${typography.cardSubtitle} mt-1`}>
                prioridade {a.prioridade} · urgência {a.urgencia} · origem {a.origens.join('+')} ·
                impacto esperado: {a.impactoEsperado} · decisão: {a.decisaoId}
              </p>
              <div className="mt-2">
                <ProgressIndicator value={a.progresso}
                  state={a.progresso === 100 ? 'excelente' : a.status === 'bloqueada' ? 'critico' : 'bom'} />
              </div>

              {/* Checklist / etapas com marcos */}
              <ul className="mt-2 space-y-1">
                {a.etapas.map((e) => (
                  <li key={e.ordem} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={e.concluida}
                      disabled={e.concluida || ['concluida', 'cancelada'].includes(a.status)}
                      onChange={() => update(a.id, (cur) => completeStep(cur, e.ordem, new Date().toISOString()))}
                      aria-label={`Concluir etapa ${e.ordem}`}
                    />
                    <span className={e.concluida ? 'line-through opacity-60' : ''}>
                      {e.marco && <b>[MARCO] </b>}{e.texto}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Responsáveis */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">responsáveis:</span>
                {a.responsaveis.filter((r) => r.status === 'ativo').map((r) => (
                  <span key={r.nome} className="rounded-full border border-border px-2 py-0.5">
                    {r.nome} ({r.funcao})
                  </span>
                ))}
                <input type="text" placeholder="nome"
                  value={respDrafts[a.id]?.nome ?? ''}
                  onChange={(e) => setRespDrafts((p) => ({ ...p, [a.id]: { funcao: p[a.id]?.funcao ?? '', nome: e.target.value } }))}
                  className="w-24 rounded-md border border-border bg-background px-1.5 py-0.5" />
                <input type="text" placeholder="função"
                  value={respDrafts[a.id]?.funcao ?? ''}
                  onChange={(e) => setRespDrafts((p) => ({ ...p, [a.id]: { nome: p[a.id]?.nome ?? '', funcao: e.target.value } }))}
                  className="w-24 rounded-md border border-border bg-background px-1.5 py-0.5" />
                <button type="button"
                  onClick={() => {
                    const d = respDrafts[a.id];
                    if (d?.nome && d?.funcao) update(a.id, (cur) => assignResponsible(cur, d, new Date().toISOString()));
                  }}
                  className="rounded-md border border-border px-2 py-0.5 hover:bg-accent">
                  atribuir
                </button>
              </div>

              {showEvidence && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  evidências: {a.evidencias.join(', ')}
                </p>
              )}

              {/* Transições válidas */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allowedActionTransitions(a.status).map((to) => (
                  <button key={to} type="button"
                    onClick={() => update(a.id, (cur) => transitionAction(cur, to, new Date().toISOString()))}
                    className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-accent">
                    → {STATUS_BADGE[to].label}
                  </button>
                ))}
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  timeline ({a.timeline.length} eventos)
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                  {a.timeline.map((e, i) => (
                    <li key={i}>
                      {new Date(e.em).toLocaleString('pt-BR')} — {e.tipo}
                      {e.de ? ` (${e.de} → ${e.para})` : ''}{e.detalhe ? ` · ${e.detalhe}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
