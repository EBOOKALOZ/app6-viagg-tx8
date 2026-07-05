/**
 * M58.1 · Barra superior do Executive Dashboard.
 * Relógio, última atualização, usuário, ambiente, conexão, período,
 * atualizar e auto-refresh — tudo via State Manager e telemetry locais.
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDashboard } from '../../state/DashboardProvider';
import { fmtDateTime } from './helpers';
import { typography, motion } from '../../core/tokens';

const PRESETS: { key: '24h' | '7d' | '30d'; label: string }[] = [
  { key: '24h', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
];

export function ExecutiveTopBar({
  updatedAt,
  onRefresh,
  lastFetchOk,
}: {
  updatedAt: number | null;
  onRefresh: () => void;
  lastFetchOk: boolean;
}) {
  const { state, dispatch } = useDashboard();
  const [now, setNow] = useState(() => new Date());
  const [email, setEmail] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    return () => {
      clearInterval(t);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const connected = online && lastFetchOk;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${typography.mono} text-sm`}>{fmtDateTime(now)}</span>
        <span className="text-xs text-muted-foreground">
          atualizado: {updatedAt ? fmtDateTime(updatedAt) : '—'}
        </span>
        <span
          className="inline-flex items-center gap-1 text-xs"
          title={connected ? 'Conectado' : 'Sem conexão com o servidor'}
        >
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            aria-hidden
          />
          {connected ? 'online' : 'offline'}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {import.meta.env.PROD ? 'Produção' : 'Teste'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {email && <span className="text-xs text-muted-foreground">{email}</span>}
        <div role="group" aria-label="Período" className="flex overflow-hidden rounded-md border border-border">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => dispatch({ type: 'set-dates', dates: { preset: p.key } })}
              className={`px-2.5 py-1 text-xs ${motion.fast} ${
                state.dates.preset === p.key
                  ? 'bg-accent font-semibold text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className={`rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent ${motion.fast}`}
        >
          Atualizar
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'set-auto-refresh', sec: state.autoRefreshSec === 0 ? 60 : 0 })
          }
          className="text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          {state.autoRefreshSec === 0 ? 'auto: pausado' : `auto: ${state.autoRefreshSec}s`}
        </button>
      </div>
    </div>
  );
}
