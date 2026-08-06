/**
 * ORION-QA Fase 2 — métricas do Dashboard Avançado.
 * Funções puras (testáveis) sobre linhas mínimas de qa_issues_enriched e
 * eventos de qa_issue_history.
 */
import { QA_OPEN_STATUSES, type QaStatus } from "./types";

/** Campos mínimos necessários para as métricas (subset da view enriquecida). */
export interface QaStatRow {
  id: string;
  status: string;
  severity: string;
  module: string;
  environment: string;
  origin: string;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  reopen_count: number;
}

export interface QaHistoryRow {
  issue_id: string;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const DAY_MS = 86_400_000;

export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} dias`;
}

/** MTTR — tempo médio até resolução (resolved_at − created_at). */
export function computeMttrMs(rows: QaStatRow[]): number | null {
  const resolved = rows.filter((r) => r.resolved_at);
  if (resolved.length === 0) return null;
  const total = resolved.reduce(
    (acc, r) => acc + (new Date(r.resolved_at as string).getTime() - new Date(r.created_at).getTime()),
    0,
  );
  return total / resolved.length;
}

/** MTBF — tempo médio entre ocorrências (gap médio entre created_at consecutivos). */
export function computeMtbfMs(rows: QaStatRow[]): number | null {
  if (rows.length < 2) return null;
  const times = rows.map((r) => new Date(r.created_at).getTime()).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < times.length; i++) total += times[i] - times[i - 1];
  return total / (times.length - 1);
}

export function countBy<K extends keyof QaStatRow>(rows: QaStatRow[], key: K): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[key] ?? "—");
    acc[v] = (acc[v] ?? 0) + 1;
  }
  return acc;
}

export function isOpenStatus(status: string): boolean {
  return QA_OPEN_STATUSES.includes(status as QaStatus);
}

export interface QaDailyPoint {
  date: string;      // yyyy-MM-dd
  criados: number;
  fechados: number;
}

/** Série diária de criados × fechados dos últimos N dias (inclui dias zerados). */
export function dailySeries(rows: QaStatRow[], days: number, now: Date = new Date()): QaDailyPoint[] {
  const points = new Map<string, QaDailyPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    points.set(key, { date: key, criados: 0, fechados: 0 });
  }
  for (const r of rows) {
    const created = r.created_at.slice(0, 10);
    const point = points.get(created);
    if (point) point.criados++;
    if (r.closed_at) {
      const closed = r.closed_at.slice(0, 10);
      const closedPoint = points.get(closed);
      if (closedPoint) closedPoint.fechados++;
    }
  }
  return [...points.values()];
}

export function countInLastDays(rows: QaStatRow[], days: number, now: Date = new Date()): number {
  const cutoff = now.getTime() - days * DAY_MS;
  return rows.filter((r) => new Date(r.created_at).getTime() >= cutoff).length;
}

/** Tempo médio de permanência em cada status, a partir do histórico.
 *  Segmenta a linha do tempo de cada problema pelos eventos de status; o
 *  segmento corrente (status atual) conta até `now`. */
export function avgTimePerStatus(
  history: QaHistoryRow[],
  now: Date = new Date(),
): Record<string, number> {
  const byIssue = new Map<string, QaHistoryRow[]>();
  for (const h of history) {
    if (!["criacao", "mudanca_status", "fechamento", "reabertura"].includes(h.event_type)) continue;
    const list = byIssue.get(h.issue_id) ?? [];
    list.push(h);
    byIssue.set(h.issue_id, list);
  }

  const totals: Record<string, { ms: number; n: number }> = {};
  for (const events of byIssue.values()) {
    events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (let i = 0; i < events.length; i++) {
      const status = events[i].new_value;
      if (!status) continue;
      const start = new Date(events[i].created_at).getTime();
      const end = i + 1 < events.length ? new Date(events[i + 1].created_at).getTime() : now.getTime();
      if (end <= start) continue;
      const t = (totals[status] ??= { ms: 0, n: 0 });
      t.ms += end - start;
      t.n += 1;
    }
  }

  const result: Record<string, number> = {};
  for (const [status, { ms, n }] of Object.entries(totals)) result[status] = ms / n;
  return result;
}

export interface QaAssigneeStats {
  assignedTo: string;
  atribuidos: number;
  resolvidos: number;
  criticos: number;
  emHomologacao: number;
  tempoMedioMs: number | null;
}

/** Estatísticas por responsável, ordenadas por resolvidos (ranking). */
export function assigneeStats(rows: QaStatRow[]): QaAssigneeStats[] {
  const byAssignee = new Map<string, QaStatRow[]>();
  for (const r of rows) {
    if (!r.assigned_to) continue;
    const list = byAssignee.get(r.assigned_to) ?? [];
    list.push(r);
    byAssignee.set(r.assigned_to, list);
  }

  const stats: QaAssigneeStats[] = [];
  for (const [assignedTo, list] of byAssignee.entries()) {
    stats.push({
      assignedTo,
      atribuidos: list.length,
      resolvidos: list.filter((r) => ["homologado", "fechado"].includes(r.status)).length,
      criticos: list.filter((r) => r.severity === "critico" && isOpenStatus(r.status)).length,
      emHomologacao: list.filter((r) => r.status === "em_homologacao").length,
      tempoMedioMs: computeMttrMs(list),
    });
  }
  return stats.sort(
    (a, b) => b.resolvidos - a.resolvidos || (a.tempoMedioMs ?? Infinity) - (b.tempoMedioMs ?? Infinity),
  );
}

export type QaHeatGroup = "modulo" | "ambiente" | "responsavel";
export type QaHeatBucket = "dia" | "semana" | "mes";

export interface QaHeatmapData {
  rows: string[];              // valores do agrupamento (linhas)
  cols: string[];              // rótulos dos buckets de tempo (colunas)
  cells: Record<string, Record<string, number>>; // row → col → contagem
  max: number;
}

function bucketKey(dateIso: string, bucket: QaHeatBucket): string {
  const d = new Date(dateIso);
  if (bucket === "mes") return dateIso.slice(0, 7); // yyyy-MM
  if (bucket === "semana") {
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
    return monday.toISOString().slice(0, 10);
  }
  return dateIso.slice(0, 10);
}

/** Heatmap: agrupamento (módulo/ambiente/responsável) × tempo (dia/semana/mês). */
export function buildHeatmap(
  rows: QaStatRow[],
  group: QaHeatGroup,
  bucket: QaHeatBucket,
  buckets: number,
  now: Date = new Date(),
): QaHeatmapData {
  const step = bucket === "dia" ? DAY_MS : bucket === "semana" ? 7 * DAY_MS : 30 * DAY_MS;
  const cols: string[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    cols.push(bucketKey(new Date(now.getTime() - i * step).toISOString(), bucket));
  }
  const colSet = new Set(cols);

  const groupOf = (r: QaStatRow): string =>
    group === "modulo" ? r.module : group === "ambiente" ? r.environment : r.assigned_to ?? "—";

  const cells: Record<string, Record<string, number>> = {};
  let max = 0;
  for (const r of rows) {
    const col = bucketKey(r.created_at, bucket);
    if (!colSet.has(col)) continue;
    const rowKey = groupOf(r);
    const rowCells = (cells[rowKey] ??= {});
    rowCells[col] = (rowCells[col] ?? 0) + 1;
    if (rowCells[col] > max) max = rowCells[col];
  }

  const rowKeys = Object.keys(cells).sort(
    (a, b) => Object.values(cells[b]).reduce((s, v) => s + v, 0) - Object.values(cells[a]).reduce((s, v) => s + v, 0),
  );
  return { rows: rowKeys, cols, cells, max };
}
