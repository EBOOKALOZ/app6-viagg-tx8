/**
 * M58.1 · Executive Dashboard — helpers PUROS de apresentação.
 *
 * Regra de ouro: NENHUMA regra de negócio, NENHUMA agregação de valores.
 * O que existe aqui: formatação (Intl), montagem de janelas de consulta
 * (parâmetros p/ a Semantic Layer), mapeamento de shapes oficiais p/ props
 * de componentes, contagem/ordenação presentacional de registros oficiais
 * e comparação direcional entre dois valores oficiais (seta de tendência).
 */

import type { TimelineEntry } from '../../components/indicators';

// ── Formatação (Intl — sem matemática) ────────────────────────
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR');

export function fmtBRL(v: number | null | undefined): string | null {
  return v == null ? null : brl.format(v);
}
export function fmtNum(v: number | null | undefined): string | null {
  return v == null ? null : num.format(v);
}
export function fmtDateTime(iso: string | number | Date | null | undefined): string {
  if (iso == null) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

// ── Janelas de consulta (parâmetros oficiais da Semantic Layer) ──
export interface QueryWindow {
  grain: '1h' | '1d';
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  label: string;
  prevLabel: string;
}

/** Janela atual + janela ANTERIOR de mesmo tamanho (comparação lado a lado). */
export function windowForPreset(
  preset: '24h' | '7d' | '30d' | 'custom',
  now: Date,
  custom?: { from?: string; to?: string },
): QueryWindow {
  if (preset === 'custom' && custom?.from && custom?.to) {
    const from = new Date(custom.from);
    const to = new Date(custom.to);
    const span = to.getTime() - from.getTime();
    return {
      grain: span <= 48 * 3600_000 ? '1h' : '1d',
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: new Date(from.getTime() - span).toISOString(),
      prevTo: from.toISOString(),
      label: 'período selecionado',
      prevLabel: 'período anterior',
    };
  }
  const days = preset === '24h' ? 1 : preset === '7d' ? 7 : 30;
  const span = days * 24 * 3600_000;
  const to = now;
  const from = new Date(to.getTime() - span);
  return {
    grain: days === 1 ? '1h' : '1d',
    from: from.toISOString(),
    to: to.toISOString(),
    prevFrom: new Date(from.getTime() - span).toISOString(),
    prevTo: from.toISOString(),
    label: days === 1 ? 'últimas 24h' : `últimos ${days} dias`,
    prevLabel: days === 1 ? '24h anteriores' : `${days} dias anteriores`,
  };
}

// ── Tendência (comparação PRESENTACIONAL entre valores oficiais) ──
export type TrendDirection = 'up' | 'down' | 'flat' | null;

export function trendDirection(
  current: number | null | undefined,
  previous: number | null | undefined,
): TrendDirection {
  if (current == null || previous == null) return null;
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

export const TREND_GLYPH: Record<Exclude<TrendDirection, null>, string> = {
  up: '▲',
  down: '▼',
  flat: '◆',
};

// ── Shapes oficiais → props de componentes ────────────────────
export interface MetricPayload {
  ok?: boolean;
  value?: number | null;
  unit?: string;
  version?: number;
  status?: string;
  series?: { bucket: string; value: number }[];
}

/** Bundle oficial: objeto {chave: MetricPayload}. Acesso defensivo. */
export function metricFromBundle(bundle: unknown, key: string): MetricPayload | null {
  if (!bundle || typeof bundle !== 'object') return null;
  const m = (bundle as Record<string, unknown>)[key];
  return m && typeof m === 'object' ? (m as MetricPayload) : null;
}

export function seriesToPoints(m: MetricPayload | null): { x: string; y: number }[] {
  return (m?.series ?? []).map((p) => ({ x: p.bucket, y: p.value }));
}

// ── Alertas: agrupamento presentacional das 6 severidades em 4 faixas ──
export interface SeverityBuckets {
  criticos: number;
  altos: number;
  medios: number;
  informativos: number;
}

export function severityBuckets(porSeveridade: unknown): SeverityBuckets {
  const p = (porSeveridade ?? {}) as Record<string, number>;
  const n = (k: string) => (typeof p[k] === 'number' ? p[k] : 0);
  return {
    criticos: n('emergencia') + n('critico'),
    altos: n('alto'),
    medios: n('atencao'),
    informativos: n('aviso') + n('informacao'),
  };
}

// ── Saúde: contagens presentacionais das classificações oficiais ──
export interface HealthCounts {
  saudaveis: number;
  degradados: number;
  offline: number;
}

export function healthCounts(healthArr: unknown): HealthCounts {
  const arr = Array.isArray(healthArr) ? (healthArr as { classification?: string }[]) : [];
  const c: HealthCounts = { saudaveis: 0, degradados: 0, offline: 0 };
  for (const h of arr) {
    if (h.classification === 'Excelente' || h.classification === 'Bom') c.saudaveis++;
    else if (h.classification === 'Offline') c.offline++;
    else c.degradados++;
  }
  return c;
}

/** Componentes da Linha 6 (Situação Operacional). "Health/Alert Center" da
 *  spec são os OBSERVADORES — exibimos os componentes observados. */
export const OPERATIONAL_COMPONENTS = [
  'etl',
  'dispatcher',
  'matching',
  'semantic_layer',
  'rpcs',
  'rollups',
  'banco',
  'jobs',
] as const;

export function pickComponent(
  healthArr: unknown,
  component: string,
): { name: string; classification: string; score: number | null } | null {
  const arr = Array.isArray(healthArr)
    ? (healthArr as { component?: string; name?: string; classification?: string; score?: number | null }[])
    : [];
  const h = arr.find((x) => x.component === component);
  if (!h) return null;
  return {
    name: h.name ?? component,
    classification: h.classification ?? 'Offline',
    score: typeof h.score === 'number' ? h.score : null,
  };
}

// ── Atividade recente: fusão/ordenação presentacional de registros oficiais ──
export function recentActivity(sources: {
  incidents?: unknown;
  alertHistory?: unknown;
  healthTimeline?: unknown;
}): TimelineEntry[] {
  const out: (TimelineEntry & { ts: number })[] = [];

  const inc = Array.isArray(sources.incidents) ? (sources.incidents as Record<string, unknown>[]) : [];
  for (const i of inc.slice(0, 8)) {
    const at = String(i.started_at ?? '');
    out.push({
      ts: Date.parse(at) || 0,
      at: fmtDateTime(at),
      title: `Incidente ${i.status === 'open' ? 'aberto' : 'resolvido'}: ${String(i.component ?? '')}`,
      description: i.cause ? String(i.cause) : undefined,
      state: i.status === 'open' ? 'critico' : 'bom',
    });
  }

  const al = Array.isArray(sources.alertHistory) ? (sources.alertHistory as Record<string, unknown>[]) : [];
  for (const a of al.slice(0, 8)) {
    const at = String(a.detectado_em ?? '');
    out.push({
      ts: Date.parse(at) || 0,
      at: fmtDateTime(at),
      title: `Alerta ${String(a.severity ?? '')}: ${String(a.origem ?? '')}`,
      description: a.resolucao ? `Resolução: ${String(a.resolucao)}` : `status: ${String(a.status ?? '')}`,
      state:
        a.severity === 'emergencia' || a.severity === 'critico'
          ? 'critico'
          : a.severity === 'alto'
            ? 'alto'
            : 'aviso',
    });
  }

  const ht = Array.isArray(sources.healthTimeline)
    ? (sources.healthTimeline as Record<string, unknown>[])
    : [];
  for (const h of ht.slice(0, 4)) {
    const at = String(h.em ?? '');
    out.push({
      ts: Date.parse(at) || 0,
      at: fmtDateTime(at),
      title: `Medição de saúde: ${String(h.component ?? '')} = ${h.score == null ? 'sem dados' : String(h.score)}`,
      state: 'bom',
    });
  }

  return out
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12)
    .map(({ ts: _ts, ...e }) => e);
}
