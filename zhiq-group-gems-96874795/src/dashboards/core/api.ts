/**
 * M58.0 · Dashboard API Layer — ÚNICO caminho de acesso a dados.
 *
 * Nenhum componente React chama supabase.rpc diretamente: tudo passa por
 * `callDataset(key, params)`, que resolve a RPC no registry, aplica
 * timeout, classifica erros de forma uniforme e registra telemetria local.
 * Retry/backoff e estados de loading ficam no react-query (useDataset).
 */

import { supabase } from '@/integrations/supabase/client';
import { getDataset, type DatasetKey } from './registry';
import { cache, CACHE_ENABLED } from './cache';
import { telemetry } from './telemetry';

export type ApiErrorKind = 'permission' | 'timeout' | 'network' | 'contract' | 'unknown';

export class DashboardApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly dataset: string;
  constructor(kind: ApiErrorKind, dataset: string, message: string) {
    super(message);
    this.name = 'DashboardApiError';
    this.kind = kind;
    this.dataset = dataset;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

function classify(dataset: string, err: unknown): DashboardApiError {
  const msg = err instanceof Error ? err.message : String(err);
  // P0003 = guarda de autorização do banco (camada única)
  if (msg.includes('P0003') || /acesso negado|permission denied/i.test(msg))
    return new DashboardApiError('permission', dataset, 'Acesso negado pelo banco (papel insuficiente).');
  if (/timeout/i.test(msg))
    return new DashboardApiError('timeout', dataset, `Tempo esgotado consultando ${dataset}.`);
  if (/fetch|network|failed to/i.test(msg))
    return new DashboardApiError('network', dataset, 'Falha de rede ao consultar o dataset.');
  return new DashboardApiError('unknown', dataset, msg);
}

/**
 * Chama um dataset oficial. `params` sobrescreve os defaults do registry.
 * Lança DashboardApiError classificado — tratamento uniforme na UI.
 */
export async function callDataset<T = unknown>(
  key: DatasetKey,
  params?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const def = getDataset(key);
  const args = { ...(def.defaultParams ?? {}), ...(params ?? {}) };
  const cacheKey = `${key}:${JSON.stringify(args)}`;

  if (CACHE_ENABLED) {
    const hit = cache.get<T>(cacheKey);
    if (hit !== undefined) return hit;
  }

  const t0 = performance.now();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const call = supabase.rpc(def.rpc as never, args as never).then(({ data, error }) => {
      if (error) throw error;
      return data as T;
    });
    const data = await Promise.race([call, timeout]);
    telemetry.recordFetch({ dataset: key, ms: performance.now() - t0, ok: true });
    if (CACHE_ENABLED) cache.set(cacheKey, data, def.refreshSec * 1000);
    return data;
  } catch (err) {
    const apiErr = classify(key, err);
    telemetry.recordFetch({
      dataset: key,
      ms: performance.now() - t0,
      ok: false,
      errorKind: apiErr.kind,
    });
    throw apiErr;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Heurística de "vazio" uniforme p/ os estados da UI. */
export function isEmptyDataset(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') return Object.keys(data as object).length === 0;
  return false;
}
