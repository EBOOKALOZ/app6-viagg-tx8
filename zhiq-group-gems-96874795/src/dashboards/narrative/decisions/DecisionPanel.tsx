/**
 * M59.6 · Decision Intelligence — 5ª aba do painel narrativo.
 * Fila auditável de decisões do CEO: estados, dependências, timeline,
 * impacto esperado × observado, evidências. A IA organiza; o CEO decide.
 * Persistência local (localStorage) — zero SQL, snapshots append-only.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { typography, borders } from '../../core/tokens';
import { StatusBadge } from '../../components/indicators';
import { EmptyState } from '../../components/feedback';
import type { StrategicResult } from '../narrators/strategicComposer';
import {
  type Decision, type DecisionSnapshot, type DecisionStatus, type ImpactSituation,
  ingestStrategicDecisions, transitionDecision, allowedTransitions,
  dependencyView, registerObservedImpact, takeDecisionSnapshot,
  compareDecisionSnapshots, decisionInvariants,
} from './decisionEngine';

const STORE_KEY = 'viagg.decisions.v1';

interface DecisionStore {
  decisions: Decision[];
  snapshots: DecisionSnapshot[]; // append-only
}

function loadStore(): DecisionStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as DecisionStore;
  } catch { /* store corrompido: recomeça vazio */ }
  return { decisions: [], snapshots: [] };
}

function saveStore(s: DecisionStore): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage indisponível */ }
}

const STATUS_BADGE: Record<DecisionStatus, { state: 'bom' | 'atencao' | 'critico' | 'alto' | 'offline' | 'excelente'; label: string }> = {
  pendente: { state: 'atencao', label: 'Pendente' },
  em_analise: { state: 'aviso' as 'atencao', label: 'Em análise' },
  aprovada: { state: 'alto', label: 'Aprovada' },
  adiada: { state: 'offline', label: 'Adiada' },
  rejeitada: { state: 'offline', label: 'Rejeitada' },
  em_execucao: { state: 'bom', label: 'Em execução' },
  concluida: { state: 'excelente', label: 'Concluída' },
  cancelada: { state: 'offline', label: 'Cancelada' },
};

const SITUACOES: ImpactSituation[] = ['confirmado', 'parcialmente_confirmado', 'inconclusivo', 'nao_confirmado'];

export function DecisionPanel({ strategic }: { strategic: StrategicResult }) {
  const [store, setStore] = useState<DecisionStore>(() => loadStore());
  const [showEvidence, setShowEvidence] = useState(false);
  const [impactDrafts, setImpactDrafts] = useState<Record<string, { descricao: string; situacao: ImpactSituation }>>({});

  useEffect(() => saveStore(store), [store]);

  // ingestão idempotente das decisões estratégicas atuais
  const ingest = () => {
    setStore((s) => {
      const decisions = ingestStrategicDecisions(strategic, s.decisions, new Date().toISOString());
      const snap = takeDecisionSnapshot(decisions, new Date().toISOString());
      return { decisions, snapshots: [...s.snapshots, snap] }; // append-only
    });
  };

  const doTransition = (id: string, to: DecisionStatus) => {
    setStore((s) => ({
      ...s,
      decisions: s.decisions.map((d) =>
        d.id === id ? (transitionDecision(d, to, new Date().toISOString()) ?? d) : d),
    }));
  };

  const doImpact = (id: string) => {
    const draft = impactDrafts[id];
    if (!draft?.descricao) return;
    setStore((s) => ({
      ...s,
      decisions: s.decisions.map((d) =>
        d.id === id ? (registerObservedImpact(d, draft, new Date().toISOString()) ?? d) : d),
    }));
  };

  const deps = useMemo(() => dependencyView(store.decisions), [store.decisions]);
  const blockedIds = useMemo(() => new Set(deps.bloqueadas.map((d) => d.id)), [deps]);
  const problems = useMemo(() => decisionInvariants(store.decisions), [store.decisions]);
  const lastSnap = store.snapshots[store.snapshots.length - 1] ?? null;
  const prevSnap = store.snapshots[store.snapshots.length - 2] ?? null;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={typography.cardSubtitle}>
          A IA organiza e acompanha — <b>quem decide é o CEO</b>. Decisões derivam exclusivamente do
          Strategic Composer; nenhuma existe sem evidências. {problems.length > 0 && `⚠ invariantes: ${problems[0]}`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={ingest}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
            Importar decisões estratégicas
          </button>
          <button type="button" onClick={() => setShowEvidence((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
            {showEvidence ? 'Ocultar evidências' : 'Mostrar evidências'}
          </button>
        </div>
      </div>

      {/* Snapshot atual + evolução */}
      {lastSnap && (
        <div className={`${borders.radiusSm} ${borders.edge} bg-card p-3 text-xs`}>
          <span className={typography.mono}>
            snapshot {new Date(lastSnap.em).toLocaleTimeString('pt-BR')} · total {lastSnap.total} ·
            abertas {lastSnap.abertas} · concluídas {lastSnap.concluidas} · adiadas {lastSnap.adiadas} ·
            impactos confirmados {lastSnap.impactosConfirmados}
          </span>
          <p className="mt-1 text-muted-foreground">
            {compareDecisionSnapshots(prevSnap, lastSnap).join(' ')}
          </p>
        </div>
      )}

      {/* Grafo resumido */}
      <div className="flex flex-wrap gap-2 text-xs">
        <StatusBadge state="critico" label={`bloqueadas: ${deps.bloqueadas.length}`} />
        <StatusBadge state="bom" label={`desbloqueadas: ${deps.desbloqueadas.length}`} />
        <StatusBadge state="offline" label={`independentes: ${deps.independentes.length}`} />
      </div>

      {/* Fila de decisões */}
      {store.decisions.length === 0 ? (
        <EmptyState
          title="Fila de decisões vazia"
          description='Use "Importar decisões estratégicas" para trazer as decisões recomendadas pelo Strategic Composer.'
        />
      ) : (
        <div className="space-y-2">
          {store.decisions.map((d) => (
            <div key={d.id} className={`${borders.radius} ${borders.edge} bg-card p-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge state={STATUS_BADGE[d.status].state} label={STATUS_BADGE[d.status].label} />
                {blockedIds.has(d.id) && <StatusBadge state="critico" label="BLOQUEADA" />}
                <p className="text-xs font-semibold">{d.titulo}</p>
                <span className={`${typography.mono} text-[10px] text-muted-foreground`}>{d.id}</span>
              </div>
              <p className="mt-1 text-sm">{d.descricao}</p>
              <p className={`${typography.cardSubtitle} mt-1`}>
                prioridade {d.prioridade} · urgência {d.urgencia} · origem {d.origens.join('+')} ·
                impacto esperado: {d.impactoEsperado}
                {d.dependencias.length > 0 && ` · depende de: ${d.dependencias.join(', ')}`}
              </p>
              {d.impactoObservado && (
                <p className="mt-1 text-xs">
                  <b>Impacto observado ({d.impactoObservado.situacao}):</b> {d.impactoObservado.descricao}
                </p>
              )}
              {showEvidence && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  evidências: {d.evidencias.join(', ')}
                </p>
              )}

              {/* Ações do CEO: só transições VÁLIDAS aparecem */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {allowedTransitions(d.status).map((to) => (
                  <button key={to} type="button" onClick={() => doTransition(d.id, to)}
                    className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-accent">
                    → {STATUS_BADGE[to].label}
                  </button>
                ))}
                {d.status === 'concluida' && !d.impactoObservado && (
                  <span className="flex flex-wrap items-center gap-1">
                    <input
                      type="text" placeholder="impacto observado…"
                      value={impactDrafts[d.id]?.descricao ?? ''}
                      onChange={(e) => setImpactDrafts((p) => ({
                        ...p, [d.id]: { situacao: p[d.id]?.situacao ?? 'inconclusivo', descricao: e.target.value },
                      }))}
                      className="w-44 rounded-md border border-border bg-background px-2 py-0.5 text-[11px]"
                    />
                    <select
                      value={impactDrafts[d.id]?.situacao ?? 'inconclusivo'}
                      onChange={(e) => setImpactDrafts((p) => ({
                        ...p, [d.id]: { descricao: p[d.id]?.descricao ?? '', situacao: e.target.value as ImpactSituation },
                      }))}
                      className="rounded-md border border-border bg-background px-1 py-0.5 text-[11px]"
                    >
                      {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={() => doImpact(d.id)}
                      className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-accent">
                      registrar
                    </button>
                  </span>
                )}
              </div>

              {/* Timeline auditável */}
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  timeline ({d.timeline.length} eventos)
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                  {d.timeline.map((e, i) => (
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
