/**
 * M58.0 · Component Library — indicadores (StatusBadge, ProgressIndicator,
 * Gauge, Timeline). Puramente presentacionais; cores SÓ da escala semântica
 * oficial (tokens.stateColors) — nunca decorativas.
 */

import React from 'react';
import { stateColors, typography, type StateColorKey } from '../core/tokens';

const STATE_LABEL: Record<string, string> = {
  excelente: 'Excelente',
  bom: 'Bom',
  atencao: 'Atenção',
  critico: 'Crítico',
  offline: 'Offline',
  informacao: 'Informação',
  aviso: 'Aviso',
  alto: 'Alto',
  emergencia: 'Emergência',
};

/** Normaliza rótulos vindos do banco (Excelente/Critico/…) p/ chave de cor. */
export function stateKeyFrom(raw: string | null | undefined): StateColorKey {
  const k = (raw ?? 'offline').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (k in stateColors ? k : 'offline') as StateColorKey;
}

export function StatusBadge({ state, label }: { state: StateColorKey; label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: stateColors[state] }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {label ?? STATE_LABEL[state] ?? state}
    </span>
  );
}

export function ProgressIndicator({
  value,
  max = 100,
  state = 'bom',
  showValue = true,
}: {
  value: number | null;
  max?: number;
  state?: StateColorKey;
  showValue?: boolean;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={value ?? undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: stateColors[state] }}
        />
      </div>
      {showValue && (
        <span className={`${typography.mono} text-xs text-muted-foreground`}>
          {value === null ? '—' : Math.round(pct)}
        </span>
      )}
    </div>
  );
}

/** Gauge semicircular 0–100 (Health Score). value=null ⇒ sem dados, honesto. */
export function Gauge({
  value,
  state,
  size = 120,
  label,
}: {
  value: number | null;
  state?: StateColorKey;
  size?: number;
  label?: string;
}) {
  const r = size / 2 - 8;
  const circumference = Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const resolvedState: StateColorKey =
    state ?? (value === null ? 'offline' : pct >= 90 ? 'excelente' : pct >= 75 ? 'bom' : pct >= 50 ? 'atencao' : 'critico');
  return (
    <figure className="inline-flex flex-col items-center" aria-label={label ?? 'gauge'}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path
          d={`M 8 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 4}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <path
          d={`M 8 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 4}`}
          fill="none"
          stroke={stateColors[resolvedState]}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          className="fill-foreground"
          fontSize={size / 5}
          fontWeight={700}
        >
          {value === null ? '—' : Math.round(value)}
        </text>
      </svg>
      {label && <figcaption className={typography.kpiLabel}>{label}</figcaption>}
    </figure>
  );
}

export interface TimelineEntry {
  at: string;
  title: string;
  description?: string;
  state?: StateColorKey;
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative">
          <span
            className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background"
            style={{ backgroundColor: stateColors[e.state ?? 'bom'] }}
          />
          <p className="text-xs text-muted-foreground">{e.at}</p>
          <p className="text-sm font-medium">{e.title}</p>
          {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
        </li>
      ))}
    </ol>
  );
}
