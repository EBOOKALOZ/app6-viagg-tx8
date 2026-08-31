/**
 * 🚦 Feature Flags — controle centralizado de funcionalidades.
 *
 * Cada flag desabilita ações transacionais do módulo correspondente.
 * Visualização pública permanece ativa — somente operações de escrita
 * (insert, update, delete, RPC financeira) são bloqueadas.
 *
 * Reserve Core permanece intacto para futuro uso — a desativação é
 * estritamente isolada a Doações e Ofertas.
 *
 * Para reativar, basta trocar para `true` e fazer deploy.
 */

// ─── Doações (Convênio) ─────────────────────────────────────────
/** Quando `false`, bloqueia createDonation, updateDonationStatus */
export const DONATIONS_ACTIONS_ENABLED = false;

// ─── Ofertas (Discount Requests / Arremate Offers) ──────────────
/** Quando `false`, bloqueia submit de ofertas, accept/reject/delete, unlockContact para ofertas */
export const OFFERS_ACTIONS_ENABLED = false;

// ─── Mensagem padrão ────────────────────────────────────────────
/** Exibida em toasts e tooltips quando a ação está bloqueada */
export const DISABLED_ACTION_MESSAGE = "Ação indisponível no momento";
