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

/**
 * Abre a checkout_url do gateway.
 *  - Celular: navega na mesma aba (página do MP em modo mobile).
 *  - Desktop: abre nova aba, preservando o contexto do app.
 */
export function openCheckoutUrl(url: string | null | undefined): void {
  if (!url) return;
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
  const { protocol, hostname, href } = window.location;
  if (protocol !== "https:") return undefined;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname)) return undefined;
  return href;
}
