/**
 * M58.5 · Dashboard Shell — a casca DEFINITIVA do Painel Executivo.
 *
 * Rota canônica /dashboards/*: provider ÚNICO, sidebar oficial (NAV_TREE,
 * filtrada por permissão, com favoritos), header com breadcrumbs + busca
 * global + sessão, e as páginas como rotas aninhadas lazy (chunks
 * separados). Espaços preparados: Business (M58.3), RIDV, IA (M59) —
 * placeholders declarados, sem refatoração futura.
 */

import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { DashboardProvider, useDashboard } from '../state/DashboardProvider';
import { DashboardLayout } from '../layout/DashboardLayout';
import { NAV_TREE, sectionForPath, type NavSection } from '../layout/navigation';
import { SkeletonBlock, EmptyState } from '../components/feedback';
import { typography } from '../core/tokens';
import { GlobalSearch, SessionBadge } from './GlobalSearch';
import { DashboardHome } from './DashboardHome';
import { NarrativePanel } from './NarrativePanel';

const ExecutivePanel = lazy(() =>
  import('../pages/executive/ExecutiveDashboard').then((m) => ({ default: m.ExecutivePanel })),
);
const OperationsPanel = lazy(() =>
  import('../pages/operational/OperationsDashboard').then((m) => ({ default: m.OperationsPanel })),
);
const GovernancePanel = lazy(() =>
  import('../pages/governance/GovernanceDashboard').then((m) => ({ default: m.GovernancePanel })),
);

/** Seção sem módulo visual: placeholder oficial (nunca inventa conteúdo). */
function PlannedSection({ section }: { section: NavSection }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState
        title={`${section.label} — em construção`}
        description={
          section.key === 'marketplace' || section.key === 'corridas' ||
          section.key === 'entregas' || section.key === 'fretes' || section.key === 'comercial' ||
          section.key === 'financeiro'
            ? 'M58.3 suspenso até as verticais terem métricas oficiais certificadas na Semantic Layer — nenhum dado será estimado.'
            : 'Módulo planejado no roadmap do Programa CIO.'
        }
      />
    </div>
  );
}

function ShellInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, dispatch } = useDashboard();

  // sincroniza seção ativa (e recentes) com a URL — fonte única: o router
  useEffect(() => {
    const s = sectionForPath(location.pathname);
    if (s && s.key !== state.activeSection) {
      dispatch({ type: 'set-section', section: s.key });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const active = NAV_TREE.find((s) => s.key === state.activeSection);
  const goto = (s: NavSection) => navigate(s.path);

  return (
    <DashboardLayout
      title={active?.label ?? 'Painel Executivo'}
      onNavigate={goto}
      actions={
        <div className="flex items-center gap-2">
          <GlobalSearch onGo={goto} />
          <SessionBadge />
        </div>
      }
    >
      {/* Recentes — navegação de 1 clique (persistida) */}
      {state.preferences.recents.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>recentes:</span>
          {state.preferences.recents
            .filter((r) => r !== state.activeSection)
            .slice(0, 4)
            .map((r) => {
              const s = NAV_TREE.find((x) => x.key === r);
              return s ? (
                <button
                  key={r}
                  type="button"
                  onClick={() => goto(s)}
                  className="rounded-full border border-border px-2 py-0.5 hover:bg-accent"
                >
                  {s.label}
                </button>
              ) : null;
            })}
        </div>
      )}

      <Suspense fallback={<SkeletonBlock lines={6} />}>
        <Routes>
          <Route index element={<DashboardHome onGo={goto} />} />
          <Route path="executivo/*" element={<ExecutivePanel />} />
          <Route path="operacoes/*" element={<OperationsPanel />} />
          <Route path="governanca/*" element={<GovernancePanel />} />
          <Route path="resumo-ia" element={<NarrativePanel />} />
          {NAV_TREE.filter((s) => s.status === 'planejada').map((s) => (
            <Route
              key={s.key}
              path={s.path.replace('/dashboards/', '') + '/*'}
              element={<PlannedSection section={s} />}
            />
          ))}
          <Route
            path="*"
            element={
              <div className="py-16 text-center">
                <p className={typography.cardTitle}>Página não encontrada no Painel Executivo.</p>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </DashboardLayout>
  );
}

export default function DashboardShell() {
  return (
    <DashboardProvider>
      <ShellInner />
    </DashboardProvider>
  );
}
