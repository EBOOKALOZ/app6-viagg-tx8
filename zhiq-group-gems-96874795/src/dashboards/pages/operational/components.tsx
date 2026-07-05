/**
 * M58.2 · NOC — os 5 componentes do módulo (spec):
 * OperationalTopBar · ComponentGrid · QueuePanel · IncidentPanel ·
 * HealthOverview. Todos desacoplados de dados (props), compostos da
 * Component Library do M58.0; nada aqui calcula valores.
 */

import React, { useEffect, useState } from 'react';
import { typography, borders, stateColors, motion } from '../../core/tokens';
import { StatusBadge, Gauge, stateKeyFrom } from '../../components/indicators';
import { IncidentCard } from '../../components/cards';
import { EmptyState } from '../../components/feedback';
import { fmtDateTime, fmtNum } from '../executive/helpers';
import type { ComponentRow, QueueItem, HealthCell } from './helpers';
import type { StateColorKey } from '../../core/tokens';

// ── OperationalTopBar ─────────────────────────────────────────
export function OperationalTopBar({
  overall,
  updatedAt,
  onRefresh,
  autoLabel,
  onToggleAuto,
}: {
  overall: { state: StateColorKey; label: string };
  updatedAt: number | null;
  onRefresh: () => void;
  autoLabel: string;
  onToggleAuto: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${typography.mono} text-sm`}>{fmtDateTime(now)}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {import.meta.env.PROD ? 'Produção' : 'Teste'}
        </span>
        <StatusBadge state={overall.state} label={overall.label} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          atualizado: {updatedAt ? fmtDateTime(updatedAt) : '—'}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className={`rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent ${motion.fast}`}
        >
          Atualizar
        </button>
        <button
          type="button"
          onClick={onToggleAuto}
          className="text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          {autoLabel}
        </button>
      </div>
    </div>
  );
}

// ── HealthOverview: os 7 cards principais ─────────────────────
export interface OverviewCard {
  emoji: string;
  title: string;
  value: string | number | null;
  classification?: string | null;
  hint?: string;
}

export function HealthOverview({ cards }: { cards: OverviewCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {cards.map((c) => (
        <div key={c.title} className={`${borders.radius} ${borders.edge} bg-card p-3 text-center`}>
          <p className="text-lg" aria-hidden>{c.emoji}</p>
          <p className={typography.kpiLabel}>{c.title}</p>
          <p className={`${typography.mono} mt-1 text-xl font-bold`}>
            {c.value ?? '—'}
          </p>
          {c.classification && (
            <div className="mt-1">
              <StatusBadge state={stateKeyFrom(c.classification)} label={c.classification} />
            </div>
          )}
          {c.hint && <p className={`${typography.cardSubtitle} mt-1`}>{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// ── ComponentGrid: mapa de saúde (verde/amarelo/vermelho/cinza) ──
export function ComponentGrid({ cells }: { cells: HealthCell[] }) {
  if (!cells.length) return <EmptyState title="Sem componentes medidos" />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {cells.map((c) => (
        <div
          key={c.component}
          role="img"
          aria-label={`${c.name}: ${c.score ?? 'sem dados'}`}
          title={`${c.name} · ${c.score ?? 'sem dados'}`}
          className={`${borders.radiusSm} p-2 text-center text-white`}
          style={{ backgroundColor: stateColors[c.state] }}
        >
          <p className="truncate text-[11px] font-semibold">{c.name}</p>
          <p className={`${typography.mono} text-sm font-bold`}>{c.score ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}

// ── ComponentTable: componente/status/saúde/última execução/SLA/disp. ──
export function ComponentTable({ rows }: { rows: ComponentRow[] }) {
  if (!rows.length) return <EmptyState title="Sem dados de componentes" />;
  return (
    <div className={`${borders.radius} ${borders.edge} overflow-x-auto bg-card`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="p-2">Componente</th>
            <th className="p-2">Status</th>
            <th className="p-2">Saúde</th>
            <th className="p-2">Última medição</th>
            <th className="p-2">SLA (camada)</th>
            <th className="p-2">Disponib. 30d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.component} className="border-b border-border/50 last:border-0">
              <td className="p-2 font-medium">{r.name}</td>
              <td className="p-2">
                <StatusBadge state={stateKeyFrom(r.classification)} label={r.classification} />
              </td>
              <td className={`${typography.mono} p-2`}>{r.score ?? '—'}</td>
              <td className="p-2 text-xs text-muted-foreground">
                {r.lastMeasureAt ? fmtDateTime(r.lastMeasureAt) : '—'}
              </td>
              <td className="p-2 text-xs">{r.slaStatus ?? '—'}</td>
              <td className={`${typography.mono} p-2 text-xs`}>
                {r.availabilityPct != null ? `${r.availabilityPct}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── QueuePanel: filas oficiais + placeholders declarados ─────
export function QueuePanel({ items }: { items: QueueItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((q) => (
        <div
          key={q.name}
          className={`${borders.radiusSm} ${borders.edge} bg-card p-3 ${q.placeholder ? 'opacity-60' : ''}`}
        >
          <p className="text-xs font-semibold">{q.name}</p>
          <p className={`${typography.mono} mt-1 text-2xl font-bold`}>
            {q.placeholder ? '—' : (fmtNum(q.value) ?? '0')}
          </p>
          <p className={`${typography.cardSubtitle} mt-0.5`}>{q.hint}</p>
        </div>
      ))}
    </div>
  );
}

// ── IncidentPanel: prioridade/componente/início/duração/causa ──
export function IncidentPanel({ incidents }: { incidents: Record<string, unknown>[] }) {
  if (!incidents.length)
    return <EmptyState title="Nenhum incidente" description="Sem incidentes registrados na janela." />;
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {incidents.slice(0, 6).map((i) => (
        <IncidentCard
          key={String(i.id)}
          component={String(i.component ?? '')}
          severity={String(i.severity ?? '')}
          startedAt={fmtDateTime(String(i.started_at ?? ''))}
          durationMin={typeof i.duration_min === 'number' ? (i.duration_min as number) : null}
          status={String(i.status ?? '')}
          cause={i.cause ? String(i.cause) : null}
        />
      ))}
    </div>
  );
}
