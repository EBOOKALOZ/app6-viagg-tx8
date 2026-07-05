/**
 * M58.0 · Component Library — controles (Filters, Search, Export, Refresh).
 * Filtros são declarativos (chave/valor no State Manager); nunca SQL.
 */

import React, { useState } from 'react';
import { useDashboard } from '../state/DashboardProvider';
import { getExporter, type ExportFormat } from '../core/exporters';
import { notifications } from '../core/notifications';
import { motion } from '../core/tokens';

export interface FilterOption {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export function FiltersBar({ filters }: { filters: FilterOption[] }) {
  const { state, dispatch } = useDashboard();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <label key={f.key} className="flex items-center gap-1 text-xs text-muted-foreground">
          {f.label}
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={state.filters[f.key] ?? ''}
            onChange={(e) =>
              dispatch({ type: 'set-filter', key: f.key, value: e.target.value || null })
            }
          >
            <option value="">Todos</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {Object.values(state.filters).some((v) => v) && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'clear-filters' })}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Limpar
        </button>
      )}
    </div>
  );
}

export function SearchInput({
  placeholder = 'Buscar…',
  onSearch,
}: {
  placeholder?: string;
  onSearch: (term: string) => void;
}) {
  const [term, setTerm] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(term.trim());
      }}
    >
      <input
        type="search"
        value={term}
        placeholder={placeholder}
        onChange={(e) => setTerm(e.target.value)}
        className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
    </form>
  );
}

export function ExportButton({
  source,
  payload,
  formats = ['csv', 'pdf'],
}: {
  source: string;
  payload: unknown;
  formats?: ExportFormat[];
}) {
  const handle = async (format: ExportFormat) => {
    const result = await getExporter(format).export({ source, payload });
    if (!result.ok) {
      notifications.publish({
        type: 'toast',
        level: 'info',
        title: 'Exportação indisponível',
        description: result.reason,
      });
    }
  };
  return (
    <div className="flex gap-1">
      {formats.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => void handle(f)}
          className={`rounded-md border border-border px-2 py-1 text-xs uppercase text-muted-foreground hover:bg-accent ${motion.fast}`}
          title={`Exportar ${f.toUpperCase()} (interface preparada; implementação futura)`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

export function RefreshButton({
  onRefresh,
  updatedAt,
}: {
  onRefresh: () => void;
  updatedAt?: number | null;
}) {
  const { state, dispatch } = useDashboard();
  return (
    <div className="flex items-center gap-2">
      {updatedAt && (
        <span className="text-[11px] text-muted-foreground">
          atualizado {new Date(updatedAt).toLocaleTimeString('pt-BR')}
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className={`rounded-md border border-border px-2 py-1 text-xs hover:bg-accent ${motion.fast}`}
      >
        Atualizar
      </button>
      <button
        type="button"
        onClick={() =>
          dispatch({ type: 'set-auto-refresh', sec: state.autoRefreshSec === 0 ? 60 : 0 })
        }
        className="text-[11px] text-muted-foreground underline hover:text-foreground"
        title="Pausar/retomar atualização automática de todos os painéis"
      >
        {state.autoRefreshSec === 0 ? 'retomar auto' : 'pausar auto'}
      </button>
    </div>
  );
}
