/**
 * M58.5 · Busca global + sessão — componentes da Shell.
 * Busca é PURA (filtra o NAV_TREE); a Shell decide navegar.
 */

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { searchSections, type NavSection } from '../layout/navigation';
import { usePermissions } from '../state/DashboardProvider';
import { borders, motion } from '../core/tokens';

export function GlobalSearch({ onGo }: { onGo: (s: NavSection) => void }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const results = searchSections(term);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label="Busca global de seções"
        placeholder="Buscar seção…  (ex.: alertas)"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0] && results[0].status !== 'planejada') {
            onGo(results[0]); setTerm(''); setOpen(false);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        className="w-52 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
      />
      {open && term && (
        <ul
          role="listbox"
          className={`absolute right-0 top-full z-50 mt-1 w-64 ${borders.radiusSm} ${borders.edge} bg-card p-1 shadow-md`}
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">nenhuma seção encontrada</li>
          )}
          {results.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                disabled={s.status === 'planejada'}
                onClick={() => { onGo(s); setTerm(''); setOpen(false); }}
                className={`w-full rounded px-3 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50 ${motion.fast}`}
              >
                {s.label}
                {s.status === 'planejada' && (
                  <span className="ml-1 text-[10px] text-muted-foreground">(em construção)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sessão atual: usuário + papéis (via cio_my_roles, já no provider). */
export function SessionBadge() {
  const { authz } = usePermissions();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  const roleLabel = authz.is_admin
    ? 'admin'
    : authz.roles.length
      ? authz.roles.join(', ')
      : 'usuário';
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex"
      title={email ?? undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
      {email ? email.split('@')[0] : '—'} · {roleLabel}
    </span>
  );
}
