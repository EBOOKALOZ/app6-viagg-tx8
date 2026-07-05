/**
 * M59.1 · NarrativeProvider — camada React FINA sobre o engine puro.
 *
 * Consome os 5 datasets oficiais via useDataset (mesmas chaves das páginas
 * ⇒ dedupe total do react-query: contexto compartilhado, zero consulta
 * duplicada, nenhum builder paralelo). O engine roda em useMemo — montagem
 * do contexto é síncrona e medida (alvo < 200ms; tipicamente < 5ms).
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useDataset } from '../hooks/useDataset';
import { runNarrativeEngine, type NarrativeEngineOutput } from './engine';
import type { NarrativeRawSources, RawSource } from './types';

interface NarrativeContextValue extends NarrativeEngineOutput {
  refresh: () => void;
}

const NarrativeContext = createContext<NarrativeContextValue | null>(null);

function toRaw(d: {
  data: unknown; isLoading: boolean; isError: boolean; updatedAt: number | null;
}): RawSource {
  return { data: d.data, isLoading: d.isLoading, isError: d.isError, updatedAt: d.updatedAt };
}

export function NarrativeProvider({ children }: { children: React.ReactNode }) {
  const healthExecutive = useDataset('health-executive');
  const alertExecutive = useDataset('alert-executive');
  const alertDashboard = useDataset('alert-dashboard');
  const operational = useDataset('operational');
  const governance = useDataset('governance');
  const noc = useDataset('noc');

  const output = useMemo(() => {
    const sources: NarrativeRawSources = {
      healthExecutive: toRaw(healthExecutive),
      alertExecutive: toRaw(alertExecutive),
      alertDashboard: toRaw(alertDashboard),
      operational: toRaw(operational),
      governance: toRaw(governance),
      noc: toRaw(noc),
    };
    return runNarrativeEngine(sources, new Date().toISOString());
  }, [
    healthExecutive.data, healthExecutive.isLoading, healthExecutive.isError, healthExecutive.updatedAt,
    alertExecutive.data, alertExecutive.isLoading, alertExecutive.isError, alertExecutive.updatedAt,
    alertDashboard.data, alertDashboard.isLoading, alertDashboard.isError, alertDashboard.updatedAt,
    operational.data, operational.isLoading, operational.isError, operational.updatedAt,
    governance.data, governance.isLoading, governance.isError, governance.updatedAt,
    noc.data, noc.isLoading, noc.isError, noc.updatedAt,
  ]);

  const value = useMemo<NarrativeContextValue>(
    () => ({
      ...output,
      refresh: () => {
        healthExecutive.refetch(); alertExecutive.refetch(); alertDashboard.refetch();
        operational.refetch(); governance.refetch(); noc.refetch();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [output],
  );

  return <NarrativeContext.Provider value={value}>{children}</NarrativeContext.Provider>;
}

/** Único ponto de consumo do contexto narrativo no Programa M59. */
export function useNarrative(): NarrativeContextValue {
  const ctx = useContext(NarrativeContext);
  if (!ctx) throw new Error('useNarrative deve ser usado dentro de <NarrativeProvider>');
  return ctx;
}
