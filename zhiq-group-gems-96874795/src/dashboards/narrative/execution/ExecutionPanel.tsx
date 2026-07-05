/**
 * M59.8 · Execution Intelligence — 7ª aba (visão consolidada da execução).
 * Composição pura sobre os stores de decisões e ações — zero recompute.
 */

import React, { useMemo, useState } from 'react';
import { typography, borders } from '../../core/tokens';
import { StatusBadge, ProgressIndicator } from '../../components/indicators';
import type { Decision, DecisionSnapshot } from '../decisions/decisionEngine';
import type { ActionPlan, ActionSnapshot } from '../actions/actionEngine';
import { composeExecution, executionInvariants } from './executionComposer';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* vazio */ }
  return fallback;
}

export function ExecutionPanel() {
  const [showEvidence, setShowEvidence] = useState(false);
  const [tick, setTick] = useState(0); // recompor sob demanda

  const { result, decisions, actions } = useMemo(() => {
    const dStore = load<{ decisions: Decision[]; snapshots: DecisionSnapshot[] }>(
      'viagg.decisions.v1', { decisions: [], snapshots: [] });
    const aStore = load<{ actions: ActionPlan[]; snapshots: ActionSnapshot[] }>(
      'viagg.actions.v1', { actions: [], snapshots: [] });
    return {
      decisions: dStore.decisions,
      actions: aStore.actions,
      result: composeExecution(
        dStore.decisions, aStore.actions, new Date().toISOString(),
        dStore.snapshots, aStore.snapshots),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const problems = executionInvariants(result, decisions, actions);
  const ind = result.indicadores;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={typography.cardSubtitle}>
          Planejado × executado × resultado — composição pura ({result.composicaoMs ?? '—'}ms) sobre
          Decision + Action Intelligence; origens intactas, evidências preservadas.
          {problems.length > 0 && ` ⚠ ${problems[0]}`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTick((t) => t + 1)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
            Recompor
          </button>
          <button type="button" onClick={() => setShowEvidence((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
            {showEvidence ? 'Ocultar evidências' : 'Mostrar evidências'}
          </button>
        </div>
      </div>

      {/* Indicadores oficiais */}
      <div className={`${borders.radiusSm} ${borders.edge} bg-card p-3 text-xs`}>
        <span className={typography.mono}>
          decisões {ind.decisoesTotais} · ações {ind.acoesCriadas} · concluídas {ind.acoesConcluidas} ·
          bloqueadas {ind.acoesBloqueadas} · progresso médio {ind.progressoMedio ?? '—'}% ·
          marcos {ind.marcosConcluidos} · impactos: {ind.impactosConfirmados} confirmados,
          {' '}{ind.impactosParciais} parciais, {ind.impactosInconclusivos} inconclusivos,
          {' '}{ind.aguardandoAvaliacao} aguardando avaliação oficial
        </span>
        <div className="mt-2"><ProgressIndicator value={ind.progressoMedio} /></div>
      </div>

      {/* Comparação planejado × executado */}
      {result.comparisons.length > 0 && (
        <div className={`${borders.radius} ${borders.edge} overflow-x-auto bg-card`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-2">Ação</th><th className="p-2">Estado</th><th className="p-2">Progresso</th>
                <th className="p-2">Impacto esperado</th><th className="p-2">Impacto observado</th>
              </tr>
            </thead>
            <tbody>
              {result.comparisons.map((c) => (
                <tr key={c.acaoId} className="border-b border-border/40 last:border-0">
                  <td className="p-2 font-medium">{c.objetivo}
                    {showEvidence && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {c.decisaoId} → {c.acaoId} · evidências: {c.evidencias.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="p-2">{c.estado}</td>
                  <td className={`${typography.mono} p-2`}>{c.progresso}%</td>
                  <td className="p-2">{c.impactoEsperado}</td>
                  <td className="p-2">
                    {c.impactoObservado}
                    {c.situacaoImpacto && (
                      <span className="ml-1"><StatusBadge
                        state={c.situacaoImpacto === 'confirmado' ? 'excelente'
                          : c.situacaoImpacto === 'parcialmente_confirmado' ? 'atencao'
                          : c.situacaoImpacto === 'nao_confirmado' ? 'critico' : 'offline'}
                        label={c.situacaoImpacto} /></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Relatório — 15 seções */}
      <div className="space-y-3">
        {result.secoes.map((sec) => (
          <section key={sec.key} className={`${borders.radiusSm} ${borders.edge} bg-card p-3`}>
            <h3 className={typography.cardTitle}>{sec.titulo}</h3>
            <div className="mt-1 space-y-1">
              {sec.frases.map((f, i) => (
                <div key={i}>
                  <p className="text-sm">{f.texto}</p>
                  {showEvidence && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      evidências: {f.evidencias.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Timeline consolidada */}
      <details className={`${borders.radiusSm} ${borders.edge} bg-card p-3`}>
        <summary className="cursor-pointer text-xs font-semibold">
          Timeline consolidada ({result.timelineConsolidada.length} eventos)
        </summary>
        <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
          {result.timelineConsolidada.map((e, i) => (
            <li key={i}>{new Date(e.em).toLocaleString('pt-BR')} — [{e.origem}] {e.texto}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
