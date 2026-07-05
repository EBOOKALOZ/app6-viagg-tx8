/**
 * M58.4 · Governance — componentes específicos do módulo:
 * AnswerBoard · CatalogTable · QualityPanel · LineagePanel ·
 * CertificationPanel. Desacoplados de dados; compostos da biblioteca M58.0.
 */

import React from 'react';
import { typography, borders, stateColors } from '../../core/tokens';
import { StatusBadge, ProgressIndicator } from '../../components/indicators';
import { EmptyState } from '../../components/feedback';
import type { GovernanceAnswer, CatalogRow, QualityRow, LineageStep } from './helpers';

// ── AnswerBoard: as 10 perguntas com veredito ─────────────────
export function AnswerBoard({ answers }: { answers: GovernanceAnswer[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {answers.map((a) => (
        <div key={a.question} className={`${borders.radiusSm} ${borders.edge} bg-card p-3`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold">{a.question}</p>
            <span aria-hidden className="text-sm">
              {a.ok === null ? '◻️' : a.ok ? '✅' : '❌'}
            </span>
          </div>
          <p className={`${typography.mono} mt-1 text-sm font-bold`}>{a.value}</p>
          {a.detail && <p className={`${typography.cardSubtitle} mt-0.5`}>{a.detail}</p>}
        </div>
      ))}
    </div>
  );
}

// ── CatalogTable: catálogo oficial clicável (lineage) ─────────
export function CatalogTable({
  rows,
  selected,
  onSelectMetric,
}: {
  rows: CatalogRow[];
  selected: string | null;
  onSelectMetric: (metric: string) => void;
}) {
  if (!rows.length) return <EmptyState title="Catálogo vazio" />;
  return (
    <div className={`${borders.radius} ${borders.edge} overflow-x-auto bg-card`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="p-2">Métrica</th>
            <th className="p-2">v</th>
            <th className="p-2">Status</th>
            <th className="p-2">Tipo</th>
            <th className="p-2">Unidade</th>
            <th className="p-2">Certificação</th>
            <th className="p-2">Owner</th>
            <th className="p-2">Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.metric}
              onClick={() => onSelectMetric(r.metric)}
              className={`cursor-pointer border-b border-border/50 last:border-0 hover:bg-accent/40 ${
                selected === r.metric ? 'bg-accent/60' : ''
              }`}
            >
              <td className="p-2 font-medium">
                {r.metric}
                {r.aliasOf && <span className="ml-1 text-[10px] text-muted-foreground">alias de {r.aliasOf}</span>}
              </td>
              <td className={`${typography.mono} p-2`}>{r.version}</td>
              <td className="p-2">
                <StatusBadge
                  state={r.status === 'active' ? 'bom' : r.status === 'draft' ? 'offline' : 'atencao'}
                  label={r.status}
                />
              </td>
              <td className="p-2 text-xs">{r.kind}</td>
              <td className="p-2 text-xs">{r.unit}</td>
              <td className="p-2 text-xs">{r.certification}</td>
              <td className="p-2 text-xs">{r.owner}</td>
              <td className="p-2 text-[11px] text-muted-foreground">{r.tags.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── QualityPanel: score + 4 eixos oficiais em barras ──────────
export function QualityPanel({ rows }: { rows: QualityRow[] }) {
  if (!rows.length) return <EmptyState title="Sem avaliações de qualidade" />;
  return (
    <div className="space-y-2">
      {rows.slice(0, 10).map((q) => (
        <div key={q.metric} className={`${borders.radiusSm} ${borders.edge} bg-card p-2.5`}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{q.metric}</span>
            <span className={typography.mono}>score {q.score ?? '—'}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
            {(
              [
                ['confiança', q.confianca],
                ['completude', q.completude],
                ['atualidade', q.atualidade],
                ['consistência', q.consistencia],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <ProgressIndicator
                  value={v === null ? null : v * 100}
                  state={v !== null && v < 0.5 ? 'critico' : v !== null && v < 0.8 ? 'atencao' : 'bom'}
                  showValue={false}
                />
                <p className="mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── LineagePanel: cadeia de 5 níveis renderizada ──────────────
const LAYER_LABEL: Record<string, string> = {
  origem_fisica: 'Origem física',
  etl: 'ETL',
  rollup: 'Rollup',
  semantic: 'Semantic Layer',
  rpc: 'Interface (RPC)',
};

export function LineagePanel({ steps }: { steps: LineageStep[] }) {
  if (!steps.length) return <EmptyState title="Selecione uma métrica no catálogo" />;
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.nivel} className="relative flex gap-3 pb-3">
          {i < steps.length - 1 && (
            <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden />
          )}
          <span
            className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: stateColors.bom }}
          >
            {s.nivel}
          </span>
          <div className={`${borders.radiusSm} ${borders.edge} flex-1 bg-card px-3 py-1.5`}>
            <p className="text-xs font-semibold">{LAYER_LABEL[s.camada] ?? s.camada}</p>
            <p className={`${typography.cardSubtitle} break-all`}>{s.detail || '—'}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── CertificationPanel: contagens pelos 7 níveis oficiais ─────
export function CertificationPanel({ counts }: { counts: { level: string; count: number }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {counts.map((c) => (
        <div
          key={c.level}
          className={`${borders.radiusSm} ${borders.edge} bg-card p-3 text-center ${
            c.count === 0 ? 'opacity-50' : ''
          }`}
        >
          <p className={`${typography.mono} text-xl font-bold`}>{c.count}</p>
          <p className={typography.kpiLabel}>{c.level}</p>
        </div>
      ))}
    </div>
  );
}
