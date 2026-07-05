/**
 * M58.0 · useDataset — hook ÚNICO de consumo de dados dos painéis.
 *
 * Envolve o react-query com o registry: retry com backoff, timeout (na API
 * layer), auto-refresh pela frequência oficial do dataset (respeitando o
 * intervalo global do State Manager) e estados uniformes
 * (isLoading / isEmpty / isError / errorKind / refetch).
 */

import { useQuery } from '@tanstack/react-query';
import { callDataset, isEmptyDataset, DashboardApiError } from '../core/api';
import { getDataset, type DatasetKey } from '../core/registry';
import { notifications } from '../core/notifications';
import { useDashboard } from '../state/DashboardProvider';

export interface UseDatasetResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isEmpty: boolean;
  isError: boolean;
  /** classificação uniforme p/ o ErrorState decidir a mensagem */
  errorKind: 'permission' | 'timeout' | 'network' | 'contract' | 'unknown' | null;
  errorMessage: string | null;
  refetch: () => void;
  /** timestamp da última atualização bem-sucedida */
  updatedAt: number | null;
}

export function useDataset<T = unknown>(
  key: DatasetKey,
  params?: Record<string, unknown>,
  opts?: { enabled?: boolean; refetchSec?: number },
): UseDatasetResult<T> {
  const { state } = useDashboard();
  const def = getDataset(key);

  // refresh efetivo: específico do chamador > frequência oficial do dataset;
  // pausa global (autoRefreshSec=0) desliga o polling de todos os painéis
  const refreshSec = opts?.refetchSec ?? def.refreshSec;
  const refetchInterval =
    state.autoRefreshSec === 0 ? false : Math.max(refreshSec, state.autoRefreshSec) * 1000;

  const q = useQuery({
    queryKey: ['dashboards', key, params ?? {}],
    queryFn: () => callDataset<T>(key, params),
    enabled: opts?.enabled ?? true,
    refetchInterval,
    staleTime: refreshSec * 1000,
    retry: (failureCount, error) => {
      // permissão não se resolve com retry; rede/timeout tentam 2x
      if (error instanceof DashboardApiError && error.kind === 'permission') return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const apiError = q.error instanceof DashboardApiError ? q.error : null;
  if (q.isError && apiError) {
    notifications.publish({ type: 'dataset:error', dataset: key, errorKind: apiError.kind });
  }

  return {
    data: q.data,
    isLoading: q.isPending,
    isEmpty: !q.isPending && !q.isError && isEmptyDataset(q.data),
    isError: q.isError,
    errorKind: apiError ? apiError.kind : q.isError ? 'unknown' : null,
    errorMessage: q.isError ? (apiError?.message ?? String(q.error)) : null,
    refetch: () => void q.refetch(),
    updatedAt: q.dataUpdatedAt || null,
  };
}
