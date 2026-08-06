/**
 * ORION-QA Fase 2 — atalhos de teclado da Central de Problemas.
 * Ignora eventos originados de campos de edição (input/textarea/select).
 */
import { useEffect } from "react";

export interface QaShortcutHandlers {
  /** "n" — novo problema */
  onNew?: () => void;
  /** "/" — foca a busca */
  onFocusSearch?: () => void;
  /** "k" — alterna modo Kanban */
  onToggleKanban?: () => void;
  /** "t" — volta para a tabela */
  onTableView?: () => void;
  /** "e" — exportar (abre menu) */
  onExport?: () => void;
  /** "f" — limpa filtros */
  onClearFilters?: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function useQaShortcuts(handlers: QaShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      switch (event.key) {
        case "n": handlers.onNew?.(); break;
        case "/": event.preventDefault(); handlers.onFocusSearch?.(); break;
        case "k": handlers.onToggleKanban?.(); break;
        case "t": handlers.onTableView?.(); break;
        case "e": handlers.onExport?.(); break;
        case "f": handlers.onClearFilters?.(); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
