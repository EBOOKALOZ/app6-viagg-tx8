/**
 * openCheckout — helpers para abrir a página hospedada do gateway (ex.: Checkout
 * Pro do Mercado Pago) de forma amigável ao celular.
 *
 * Problema: abrir a `checkout_url` em nova aba (`window.open(_blank)`) dentro de
 * um webview/PWA faz a página do MP renderizar em largura "desktop" e estourar a
 * tela do celular. Navegar na MESMA aba (top-level) dá à página responsiva do MP
 * a largura real do dispositivo, e ela se ajusta ao mobile.
 */

/** Heurística simples de "estou num viewport de celular". */
export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
  const ua = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || "");
  return narrow || ua;
}

/** Guarda o id da ordem em aberto p/ a página de retorno (/checkout/retorno)
 *  reconciliar o pagamento sem depender de RLS (o back_url não carrega o id). */
const PENDING_ORDER_KEY = "viagg_pending_order";
const PENDING_RETURN_KEY = "viagg_pending_return";

export function rememberPendingOrder(
  orderId: string | null | undefined,
  returnTo?: string | null,
): void {
  try {
    if (orderId) localStorage.setItem(PENDING_ORDER_KEY, orderId);
    if (returnTo) localStorage.setItem(PENDING_RETURN_KEY, returnTo);
  } catch { /* ignore */ }
}
export function getPendingOrderId(): string | null {
  try { return localStorage.getItem(PENDING_ORDER_KEY); } catch { return null; }
}
/** Pra onde mandar o cliente depois de pagar (depende do que ele comprou). */
export function getPendingReturnTo(): string | null {
  try { return localStorage.getItem(PENDING_RETURN_KEY); } catch { return null; }
}
export function clearPendingOrderId(): void {
  try {
    localStorage.removeItem(PENDING_ORDER_KEY);
    localStorage.removeItem(PENDING_RETURN_KEY);
  } catch { /* ignore */ }
}

/**
 * Abre a checkout_url do gateway.
 *  - Celular: navega na mesma aba (página do MP em modo mobile).
 *  - Desktop: abre nova aba, preservando o contexto do app.
 * Passe `orderId` (p/ confirmar o pagamento na volta) e `returnTo` (a página de
 * destino conforme o que foi comprado: créditos do anunciante, carteira, etc.).
 */
export function openCheckoutUrl(
  url: string | null | undefined,
  orderId?: string | null,
  returnTo?: string | null,
): void {
  if (!url) return;
  rememberPendingOrder(orderId, returnTo);
  if (isMobileViewport()) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * URL de retorno (back_url) para o Mercado Pago redirecionar o cliente de volta
 * ao app após o pagamento — essencial quando navegamos na mesma aba no celular.
 *
 * O MP REJEITA `auto_return` com URLs http ou localhost (quebra a criação da
 * preference). Por isso só devolvemos uma URL quando for https em domínio
 * público; caso contrário `undefined` e o driver simplesmente não adiciona
 * back_urls (comportamento atual, sem auto-retorno).
 */
export function getCheckoutBackUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const { protocol, hostname, origin } = window.location;
  if (protocol !== "https:") return undefined;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)) return undefined;
  // Página dedicada que confirma o pagamento (payments-reconcile) e mostra o
  // resultado, em vez de cair de volta numa rota qualquer sem feedback.
  return `${origin}/checkout/retorno`;
}
