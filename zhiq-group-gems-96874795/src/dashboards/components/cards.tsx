/**
 * M58.0 · Component Library — cards (KPI, Metric, Health, Alert, Incident,
 * Trend). Desacoplados de dados: recebem valores prontos por props e NUNCA
 * calculam nada (nem porcentagem de variação — vem pronta do dataset).
 */

import React from 'react';
import { typography, borders, type StateColorKey } from '../core/tokens';
import { StatusBadge, Gauge, stateKeyFrom } from './indicators';

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${borders.radius} ${borders.edge} bg-card p-4 text-card-foreground`}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  hint?: string;
}) {
  return (
    <CardShell>
      <p className={typography.kpiLabel}>{label}</p>
      <p className={`${typography.kpiValue} mt-1`}>
        {value === null || value === undefined ? '—' : value}
        {unit && value !== null && <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className={`${typography.cardSubtitle} mt-1`}>{hint}</p>}
    </CardShell>
  );
}

/** Card de métrica da Semantic Layer — exibe também versão e status oficiais. */
export function MetricCard({
  name,
  value,
  unit,
  version,
  status,
  aguardandoFonte,
}: {
  name: string;
  value: string | number | null;
  unit?: string;
  version?: number | string;
  status?: string;
  aguardandoFonte?: boolean;
}) {
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-2">
        <p className={typography.cardTitle}>{name}</p>
        {version !== undefined && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">v{version}</span>
        )}
      </div>
      <p className={`${typography.kpiValue} mt-2`}>
        {value === null || value === undefined ? '—' : value}
        {unit && value !== null && <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>}
      </p>
      {aguardandoFonte && (
        <p className={`${typography.cardSubtitle} mt-1`}>
          Aguardando fonte de dados — valores estimados são proibidos.
        </p>
      )}
      {status && status !== 'active' && !aguardandoFonte && (
        <p className={`${typography.cardSubtitle} mt-1`}>status: {status}</p>
      )}
    </CardShell>
  );
}

export function HealthCard({
  component,
  score,
  classification,
  detail,
}: {
  component: string;
  score: number | null;
  classification: string;
  detail?: string;
}) {
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <p className={typography.cardTitle}>{component}</p>
        <StatusBadge state={stateKeyFrom(classification)} label={classification} />
      </div>
      <div className="mt-2 flex justify-center">
        <Gauge value={score} size={110} />
      </div>
      {detail && <p className={`${typography.cardSubtitle} mt-2`}>{detail}</p>}
    </CardShell>
  );
}

export function AlertCard({
  ruleKey,
  severity,
  status,
  component,
  ageMin,
  occurrences,
  onAck,
  onResolve,
}: {
  ruleKey: string;
  severity: string;
  status: string;
  component?: string | null;
  ageMin?: number;
  occurrences?: number;
  onAck?: () => void;
  onResolve?: () => void;
}) {
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <p className={typography.cardTitle}>{ruleKey}</p>
        <StatusBadge state={stateKeyFrom(severity)} label={severity} />
      </div>
      <p className={`${typography.cardSubtitle} mt-1`}>
        {component ? `${component} · ` : ''}
        {status}
        {ageMin !== undefined ? ` · há ${Math.round(ageMin)} min` : ''}
        {occurrences !== undefined ? ` · ${occurrences}× ` : ''}
      </p>
      {(onAck || onResolve) && (
        <div className="mt-3 flex gap-2">
          {onAck && status === 'confirmado' && (
            <button type="button" onClick={onAck} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
              Reconhecer
            </button>
          )}
          {onResolve && (
            <button type="button" onClick={onResolve} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
              Resolver
            </button>
          )}
        </div>
      )}
    </CardShell>
  );
}

export function IncidentCard({
  component,
  severity,
  startedAt,
  durationMin,
  status,
  cause,
}: {
  component: string;
  severity: string;
  startedAt: string;
  durationMin?: number | null;
  status: 'open' | 'resolved' | string;
  cause?: string | null;
}) {
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <p className={typography.cardTitle}>{component}</p>
        <StatusBadge
          state={status === 'open' ? 'critico' : 'bom'}
          label={status === 'open' ? `Aberto · ${severity}` : 'Resolvido'}
        />
      </div>
      <p className={`${typography.cardSubtitle} mt-1`}>
        Início: {startedAt}
        {durationMin != null ? ` · duração ${Math.round(durationMin)} min` : ''}
      </p>
      {cause && <p className={`${typography.cardSubtitle} mt-1`}>Causa: {cause}</p>}
    </CardShell>
  );
}

/** Trend: série já agregada pelo dataset (nunca calculada aqui). */
export function TrendCard({
  label,
  points,
  currentLabel,
}: {
  label: string;
  points: { x: string; y: number }[];
  currentLabel?: string;
}) {
  const w = 240;
  const h = 56;
  const ys = points.map((p) => p.y);
  const max = Math.max(...ys, 1);
  const min = Math.min(...ys, 0);
  const span = max - min || 1;
  const path = points
    .map((p, i) => {
      const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4;
      const y = h - 6 - ((p.y - min) / span) * (h - 12);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <CardShell>
      <p className={typography.kpiLabel}>{label}</p>
      {points.length === 0 ? (
        <p className={`${typography.cardSubtitle} mt-2`}>Sem série no período.</p>
      ) : (
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="mt-2" aria-label={`tendência de ${label}`}>
          <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
          {points.length > 0 && (
            <circle
              cx={points.length === 1 ? w / 2 : w - 4}
              cy={h - 6 - ((points[points.length - 1].y - min) / span) * (h - 12)}
              r={3}
              fill="hsl(var(--primary))"
            />
          )}
        </svg>
      )}
      {currentLabel && <p className={`${typography.cardSubtitle} mt-1`}>{currentLabel}</p>}
    </CardShell>
  );
}
