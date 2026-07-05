/**
 * M58.0 · Dashboard State Manager — estado ÚNICO da plataforma de painéis.
 *
 * Centraliza filtros, janela de datas, atualização, preferências, sessão de
 * autorização e navegação. Nenhum outro estado global de dashboard pode ser
 * criado fora daqui (sem duplicação — regra do M58.0).
 */

import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callDataset } from '../core/api';
import { parseAuthzProfile, EMPTY_AUTHZ, can, type AuthzProfile, type Resource } from '../core/roles';

export interface DateWindow {
  /** presets alinhados aos grains da Semantic Layer */
  preset: '24h' | '7d' | '30d' | 'custom';
  from?: string; // ISO
  to?: string;   // ISO
}

export interface DashboardState {
  dates: DateWindow;
  /** filtros declarativos aplicados pelos módulos visuais (nunca SQL) */
  filters: Record<string, string | null>;
  /** intervalo global de auto-refresh em segundos (0 = pausado) */
  autoRefreshSec: number;
  preferences: {
    density: 'comfortable' | 'compact';
    sidebarCollapsed: boolean;
    /** M58.5: seções favoritas (persistidas) */
    favorites: string[];
    /** M58.5: últimas seções visitadas (persistidas, máx. 5) */
    recents: string[];
  };
  /** seção ativa da navegação (chave do NAV_TREE) */
  activeSection: string;
}

type Action =
  | { type: 'set-dates'; dates: DateWindow }
  | { type: 'set-filter'; key: string; value: string | null }
  | { type: 'clear-filters' }
  | { type: 'set-auto-refresh'; sec: number }
  | { type: 'set-preference'; patch: Partial<DashboardState['preferences']> }
  | { type: 'toggle-favorite'; section: string }
  | { type: 'set-section'; section: string };

const initialState: DashboardState = {
  dates: { preset: '24h' },
  filters: {},
  autoRefreshSec: 60,
  preferences: { density: 'comfortable', sidebarCollapsed: false, favorites: [], recents: [] },
  activeSection: 'visao-geral',
};

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'set-dates':
      return { ...state, dates: action.dates };
    case 'set-filter':
      return { ...state, filters: { ...state.filters, [action.key]: action.value } };
    case 'clear-filters':
      return { ...state, filters: {} };
    case 'set-auto-refresh':
      return { ...state, autoRefreshSec: Math.max(0, action.sec) };
    case 'set-preference':
      return { ...state, preferences: { ...state.preferences, ...action.patch } };
    case 'toggle-favorite': {
      const favs = state.preferences.favorites.includes(action.section)
        ? state.preferences.favorites.filter((f) => f !== action.section)
        : [...state.preferences.favorites, action.section];
      return { ...state, preferences: { ...state.preferences, favorites: favs } };
    }
    case 'set-section': {
      // registra também nas recentes (máx. 5, sem repetição, mais nova primeiro)
      const recents = [
        action.section,
        ...state.preferences.recents.filter((r) => r !== action.section),
      ].slice(0, 5);
      return {
        ...state,
        activeSection: action.section,
        preferences: { ...state.preferences, recents },
      };
    }
    default:
      return state;
  }
}

interface DashboardContextValue {
  state: DashboardState;
  dispatch: React.Dispatch<Action>;
  authz: AuthzProfile;
  authzLoading: boolean;
  can: (resource: Resource) => boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const PREFS_KEY = 'viagg.dashboards.prefs.v1';

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (base) => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return { ...base, preferences: { ...base.preferences, ...JSON.parse(raw) } };
    } catch {
      /* preferências corrompidas: usa default */
    }
    return base;
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(state.preferences));
    } catch {
      /* storage cheio/indisponível não é erro de painel */
    }
  }, [state.preferences]);

  // Sessão de autorização: papéis vêm do banco (cio_my_roles), nunca do cliente
  const { data: rawAuthz, isLoading: authzLoading } = useQuery({
    queryKey: ['dashboards', 'my-roles'],
    queryFn: () => callDataset('my-roles'),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const authz = useMemo(() => (rawAuthz ? parseAuthzProfile(rawAuthz) : EMPTY_AUTHZ), [rawAuthz]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      state,
      dispatch,
      authz,
      authzLoading,
      can: (resource) => can(authz, resource),
    }),
    [state, authz, authzLoading],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard deve ser usado dentro de <DashboardProvider>');
  return ctx;
}

export function usePermissions() {
  const { authz, authzLoading, can: canFn } = useDashboard();
  return { authz, loading: authzLoading, can: canFn };
}
