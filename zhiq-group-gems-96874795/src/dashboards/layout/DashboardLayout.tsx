/**
 * M58.0 · Dashboard Layout Engine — casca-base dos painéis.
 *
 * Header + sidebar (árvore oficial, filtrada por permissão) + área principal
 * com grid de widgets. Persistência de layout por usuário fica preparada
 * (interface WidgetPlacement); a implementação chega com os módulos visuais.
 */

import React from 'react';
import { NAV_TREE, breadcrumbsFor } from './navigation';
import { useDashboard } from '../state/DashboardProvider';
import { grid, borders, motion, typography } from '../core/tokens';

/** Preparação p/ persistência futura de layout (M58.x) — só o contrato. */
export interface WidgetPlacement {
  widgetId: string;
  column: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export function DashboardHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  const { state } = useDashboard();
  const crumbs = breadcrumbsFor(
    NAV_TREE.find((s) => s.key === state.activeSection)?.path ?? '/dashboards',
  );
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
      <div>
        <nav aria-label="breadcrumb" className="text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={c.path}>
              {i > 0 && <span className="mx-1">/</span>}
              {c.label}
            </span>
          ))}
        </nav>
        <h1 className={typography.sectionTitle}>{title}</h1>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}

export function DashboardSidebar({
  onNavigate,
}: {
  /** M58.5: a Shell injeta a navegação real (react-router). */
  onNavigate?: (section: (typeof NAV_TREE)[number]) => void;
}) {
  const { state, dispatch, can, authzLoading } = useDashboard();
  if (authzLoading) return <aside className="w-56 shrink-0 border-r border-border p-3" />;
  const visible = NAV_TREE.filter((s) => can(s.resource));
  const favs = state.preferences.favorites;
  const ordered = [
    ...visible.filter((s) => favs.includes(s.key)),
    ...visible.filter((s) => !favs.includes(s.key)),
  ];
  return (
    <aside
      className={`shrink-0 border-r border-border p-2 ${state.preferences.sidebarCollapsed ? 'w-14' : 'w-56'} ${motion.normal}`}
    >
      <button
        type="button"
        aria-label={state.preferences.sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        onClick={() =>
          dispatch({ type: 'set-preference', patch: { sidebarCollapsed: !state.preferences.sidebarCollapsed } })
        }
        className="mb-1 w-full rounded-md px-3 py-1 text-left text-xs text-muted-foreground hover:bg-accent/50"
      >
        {state.preferences.sidebarCollapsed ? '»' : '« recolher'}
      </button>
      <nav aria-label="Seções">
        <ul className="space-y-1">
          {ordered.map((s) => (
            <li key={s.key} className="group relative">
              <button
                type="button"
                disabled={s.status === 'planejada' && s.key !== state.activeSection}
                onClick={() => {
                  dispatch({ type: 'set-section', section: s.key });
                  onNavigate?.(s);
                }}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${motion.fast} ${
                  state.activeSection === s.key
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 disabled:opacity-50'
                }`}
                title={s.status === 'planejada' ? `${s.label} — módulo visual em construção` : s.label}
              >
                {state.preferences.sidebarCollapsed ? s.label.charAt(0) : (
                  <>
                    {favs.includes(s.key) && <span aria-hidden className="mr-1">★</span>}
                    {s.label}
                  </>
                )}
              </button>
              {!state.preferences.sidebarCollapsed && s.status !== 'planejada' && (
                <button
                  type="button"
                  aria-label={favs.includes(s.key) ? `Remover ${s.label} dos favoritos` : `Favoritar ${s.label}`}
                  onClick={() => dispatch({ type: 'toggle-favorite', section: s.key })}
                  className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground group-hover:block"
                >
                  {favs.includes(s.key) ? '★' : '☆'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/** Grid responsivo de widgets — colunas dos tokens; nunca grid ad-hoc. */
export function WidgetGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      style={{ gap: grid.gap }}
    >
      {children}
    </div>
  );
}

export function WidgetShell({
  children,
  colSpan = 1,
}: {
  children: React.ReactNode;
  colSpan?: 1 | 2 | 3 | 4;
}) {
  const span =
    colSpan === 4 ? 'xl:col-span-4 lg:col-span-3 md:col-span-2'
    : colSpan === 3 ? 'lg:col-span-3 md:col-span-2'
    : colSpan === 2 ? 'md:col-span-2'
    : '';
  return (
    <div className={`${span} ${borders.radius} ${borders.edge} bg-card text-card-foreground p-4`}>
      {children}
    </div>
  );
}

export function DashboardLayout({
  title,
  actions,
  onNavigate,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  onNavigate?: (section: (typeof NAV_TREE)[number]) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader title={title} actions={actions} />
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
