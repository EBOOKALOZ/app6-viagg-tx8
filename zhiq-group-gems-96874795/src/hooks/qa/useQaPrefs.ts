/**
 * ORION-QA Fase 2 — preferências do painel persistidas por dispositivo
 * (localStorage): modo de visualização, colunas, densidade, favoritos,
 * filtros, ordenação. Zero impacto em banco/segurança — preferência de UI.
 */
import { useCallback, useState } from "react";
import {
  QA_TABLE_COLUMNS,
  type QaQuickFilter,
  type QaSortState,
  type QaTableColumn,
  type QaViewMode,
} from "@/services/qa/types";

const STORAGE_KEY = "orion-qa:prefs:v1";

export interface QaSavedFilters {
  search: string;
  module: string;
  status: string;
  severity: string;
  origin: string;
  environment: string;
  assignedTo: string;
  periodFrom: string;
  periodTo: string;
  quickFilters: QaQuickFilter[];
}

export const QA_DEFAULT_FILTERS: QaSavedFilters = {
  search: "", module: "all", status: "all", severity: "all", origin: "all",
  environment: "all", assignedTo: "all", periodFrom: "", periodTo: "", quickFilters: [],
};

export interface QaPrefs {
  viewMode: QaViewMode;
  density: "compacto" | "expandido";
  columns: QaTableColumn[];
  favorites: string[];        // issue ids
  onlyFavorites: boolean;
  sort: QaSortState;
  savedFilters: QaSavedFilters | null; // null = não salvo (usa default ao abrir)
}

const DEFAULT_PREFS: QaPrefs = {
  viewMode: "tabela",
  density: "expandido",
  columns: [...QA_TABLE_COLUMNS],
  favorites: [],
  onlyFavorites: false,
  sort: { field: "created_at", ascending: false },
  savedFilters: null,
};

function loadPrefs(): QaPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(parsed as Partial<QaPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useQaPrefs() {
  const [prefs, setPrefsState] = useState<QaPrefs>(loadPrefs);

  const setPrefs = useCallback((patch: Partial<QaPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage cheio/indisponível: preferência vale só para a sessão
      }
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((issueId: string) => {
    setPrefsState((prev) => {
      const favorites = prev.favorites.includes(issueId)
        ? prev.favorites.filter((id) => id !== issueId)
        : [...prev.favorites, issueId];
      const next = { ...prev, favorites };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // idem
      }
      return next;
    });
  }, []);

  const toggleColumn = useCallback((column: QaTableColumn) => {
    setPrefsState((prev) => {
      const columns = prev.columns.includes(column)
        ? prev.columns.filter((c) => c !== column)
        : [...QA_TABLE_COLUMNS].filter((c) => c === column || prev.columns.includes(c));
      const next = { ...prev, columns };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // idem
      }
      return next;
    });
  }, []);

  return { prefs, setPrefs, toggleFavorite, toggleColumn };
}
