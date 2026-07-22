/**
 * useRequireAuth — porta única para proteger ações pessoais.
 *
 *   const requireAuth = useRequireAuth();
 *   onClick={() => requireAuth(() => favoritar(id), { kind: 'favorite', label: 'favoritar este anúncio', payload: { id } })}
 *
 * Logado → executa a ação na hora. Deslogado → salva a ação + contexto e abre o
 * modal de login; após autenticar, a ação roda sozinha (AuthGateProvider retoma).
 */
import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { savePendingAction, openLoginModal, type PendingAction } from "@/lib/auth/requireAuth";

type Meta = Omit<PendingAction, "returnTo" | "savedAt"> & { returnTo?: string };

export function useRequireAuth() {
  const { user } = useAuth();

  return useCallback(
    (action: () => void, meta: Meta) => {
      if (user) {
        action();
        return true;
      }
      savePendingAction({
        kind: meta.kind,
        label: meta.label,
        payload: meta.payload,
        returnTo: meta.returnTo || (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"),
      });
      openLoginModal(meta.label);
      return false;
    },
    [user]
  );
}
