/**
 * M58.2 · NOC — helpers PUROS de apresentação.
 *
 * Mesma regra do M58.1: zero regra de negócio, zero agregação de valores.
 * Aqui só há mapeamento/fusão presentacional de registros oficiais,
 * contagens de estados e seleção defensiva de campos.
 * Formatação e atividade recente são REUTILIZADAS de ../executive/helpers.
 */

import type { StateColorKey } from '../../core/tokens';
import { stateKeyFrom } from '../../components/indicators';

// ── Alertas: contagens por etapa do ciclo de vida oficial ─────
export interface AlertLifecycleCounts {
  ativos: number;
  reconhecidos: number;
  resolvidos: number;
  criticos: number;
}

/** ativos = lista de alertas vivos (status ≠ encerrado); historico = 7d. */
export function alertLifecycleCounts(ativos: unknown, historico: unknown): AlertLifecycleCounts {
  const a = Array.isArray(ativos) ? (ativos as Record<string, unknown>[]) : [];
  const h = Array.isArray(historico) ? (historico as Record<string, unknown>[]) : [];
  return {
    ativos: a.length,
    reconhecidos: a.filter((x) => x.status === 'reconhecido').length,
    resolvidos: h.filter((x) => x.status === 'resolvido' || x.status === 'encerrado').length,
    criticos: a.filter((x) => x.severity === 'critico' || x.severity === 'emergencia').length,
  };
}

// ── Tabela de componentes: fusão presentacional de 3 fontes oficiais ──
export interface ComponentRow {
  component: string;
  name: string;
  classification: string;
  score: number | null;
  /** última medição registrada na timeline 24h (campo oficial `em`) */
  lastMeasureAt: string | null;
  /** pior status de SLA entre as métricas (rótulo oficial, não recalculado) */
  slaStatus: string | null;
  /** uptime_pct oficial de cio_availability (via dataset) */
  availabilityPct: number | null;
}

export function componentRows(
  health: unknown,
  disponibilidade: unknown,
  timeline24h: unknown,
  slaArr: unknown,
): ComponentRow[] {
  const hs = Array.isArray(health)
    ? (health as { component?: string; name?: string; classification?: string; score?: number | null }[])
    : [];
  const disp = (disponibilidade ?? {}) as Record<string, unknown>;
  const tl = Array.isArray(timeline24h) ? (timeline24h as Record<string, unknown>[]) : [];
  const sla = Array.isArray(slaArr) ? (slaArr as Record<string, unknown>[]) : [];

  // pior rótulo de SLA presente (ordem oficial de gravidade — só seleção)
  const slaRank: Record<string, number> = { ok: 0, draft: 0, sem_dados: 1, atrasado: 2, degradado: 3 };
  const worstSla = sla.reduce<string | null>((worst, s) => {
    const cur = String(s.status_operacional ?? 'ok');
    if (worst === null) return cur;
    return (slaRank[cur] ?? 0) > (slaRank[worst] ?? 0) ? cur : worst;
  }, null);

  return hs.map((h) => {
    const comp = h.component ?? '';
    const last = tl.find((t) => t.component === comp); // timeline vem DESC do dataset
    const pct = disp[comp];
    return {
      component: comp,
      name: h.name ?? comp,
      classification: h.classification ?? 'Offline',
      score: typeof h.score === 'number' ? h.score : null,
      lastMeasureAt: last ? String(last.em) : null,
      // SLA é da CAMADA (métricas), não por componente — atribuímos o pior
      // rótulo apenas às camadas de dados (etl/rollups/semantic), declarado:
      slaStatus: ['etl', 'rollups', 'semantic_layer'].includes(comp) ? worstSla : null,
      availabilityPct: typeof pct === 'number' ? pct : pct != null ? Number(pct) : null,
    };
  });
}

// ── Filas: painéis a partir de campos oficiais + placeholders declarados ──
export interface QueueItem {
  name: string;
  value: number | null;
  hint: string;
  placeholder: boolean;
}

export function queueItems(nocFila: unknown, motorMetrics: unknown): QueueItem[] {
  const fila = (nocFila ?? {}) as Record<string, unknown>;
  const mm = (motorMetrics ?? {}) as Record<string, unknown>;
  const porStatus = (mm.por_status ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return [
    {
      name: 'Dispatcher — fila',
      value: n(fila.backlog),
      hint: 'solicitações AGENDADO aguardando despacho',
      placeholder: false,
    },
    {
      name: 'Dispatcher — em despacho',
      value: n(porStatus.DESPACHANDO),
      hint: 'claims ativos neste momento (lease)',
      placeholder: false,
    },
    {
      name: 'Lotes disponíveis',
      value: n(fila.lotes_available),
      hint: 'posting_lots prontos p/ o postador',
      placeholder: false,
    },
    {
      name: 'Matching',
      value: null,
      hint: 'decisão é síncrona ao despacho — sem fila própria (por desenho)',
      placeholder: true,
    },
    {
      name: 'Jobs (pg_cron)',
      value: null,
      hint: 'aguardando dataset oficial de execução de jobs',
      placeholder: true,
    },
    {
      name: 'Auto Poster',
      value: null,
      hint: 'legado em observação — morre no ACTIVE (sem dataset)',
      placeholder: true,
    },
    {
      name: 'RIDV',
      value: null,
      hint: 'reservado — módulo ainda não existe',
      placeholder: true,
    },
  ];
}

// ── Mapa de saúde: células do grid (verde/amarelo/vermelho/cinza) ──
export interface HealthCell {
  component: string;
  name: string;
  score: number | null;
  state: StateColorKey;
}

export function healthGridCells(health: unknown): HealthCell[] {
  const hs = Array.isArray(health)
    ? (health as { component?: string; name?: string; classification?: string; score?: number | null }[])
    : [];
  return hs.map((h) => ({
    component: h.component ?? '',
    name: h.name ?? h.component ?? '',
    score: typeof h.score === 'number' ? h.score : null,
    state: stateKeyFrom(h.classification),
  }));
}

// ── Tendência de um componente: pontos oficiais da timeline 24h ──
export function componentTrendPoints(
  timeline24h: unknown,
  component: string,
): { x: string; y: number }[] {
  const tl = Array.isArray(timeline24h) ? (timeline24h as Record<string, unknown>[]) : [];
  return tl
    .filter((t) => t.component === component && typeof t.score === 'number')
    .map((t) => ({ x: String(t.em), y: t.score as number }))
    .reverse(); // dataset vem DESC; gráfico lê da esquerda p/ direita
}

/** Componentes com telemetria hoje — candidatos do seletor de tendência. */
export function trendableComponents(timeline24h: unknown): string[] {
  const tl = Array.isArray(timeline24h) ? (timeline24h as Record<string, unknown>[]) : [];
  return [...new Set(tl.filter((t) => t.score != null).map((t) => String(t.component)))].sort();
}

// ── Status geral da TopBar: pior classificação presente (seleção) ──
export function overallState(situacaoGeral: unknown): {
  state: StateColorKey;
  label: string;
} {
  const s = String(situacaoGeral ?? '');
  if (s === 'SAUDAVEL') return { state: 'excelente', label: 'Operação saudável' };
  if (s === 'ATENCAO') return { state: 'atencao', label: 'Atenção' };
  if (s === 'CRITICO') return { state: 'critico', label: 'CRÍTICO' };
  return { state: 'offline', label: 'aguardando dados' };
}
