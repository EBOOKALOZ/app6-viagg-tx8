/**
 * requireAuth — política única de "ação exige login" da Viagg-TX8.
 *
 * Ações pessoais (favoritar, dar lance, seguir loja, falar com vendedor…) só
 * rodam autenticadas. Este módulo:
 *  1) guarda a AÇÃO PENDENTE + o CONTEXTO (url/produto/loja/filtros) em localStorage
 *     (sobrevive ao magic-link, que reabre o app em outra aba/rota);
 *  2) o app dispara um evento para abrir o modal de login elegante;
 *  3) ao autenticar, o app relê a ação pendente e a executa SEM o usuário reclicar.
 *
 * ⚠ Segurança: isto é UX. A autoridade é o backend — toda gravação passa por RPC
 * SECURITY DEFINER / RLS que exige auth.uid(). O front nunca é a barreira final.
 */

export const PENDING_ACTION_KEY = "viagg_pending_action";
export const OPEN_LOGIN_EVENT = "viagg:open-login-modal";

export interface PendingAction {
  /** identificador da intenção — o handler correspondente decide o que fazer */
  kind: string;
  /** url de origem (para voltar exatamente onde estava) */
  returnTo: string;
  /** payload livre da ação (listingId, storeId, etc.) */
  payload?: Record<string, unknown>;
  /** rótulo humano p/ o modal ("favoritar este anúncio", "dar seu lance"…) */
  label?: string;
  /** timestamp (ms) — via Date param, o módulo não chama Date.now sozinho */
  savedAt?: number;
}

/** Salva a ação pendente + contexto de navegação. */
export function savePendingAction(action: PendingAction) {
  try {
    const withCtx: PendingAction = {
      ...action,
      returnTo: action.returnTo || (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/"),
    };
    localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(withCtx));
  } catch { /* ignore */ }
}

export function readPendingAction(): PendingAction | null {
  try {
    const raw = localStorage.getItem(PENDING_ACTION_KEY);
    return raw ? (JSON.parse(raw) as PendingAction) : null;
  } catch { return null; }
}

export function clearPendingAction() {
  try { localStorage.removeItem(PENDING_ACTION_KEY); } catch { /* ignore */ }
}

/** Abre o modal de login (o AuthGateProvider escuta este evento). */
export function openLoginModal(reason?: string) {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT, { detail: { reason } }));
  } catch { /* ignore */ }
}
