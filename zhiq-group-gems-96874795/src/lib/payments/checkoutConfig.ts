/**
 * checkoutConfig — controla o modo do checkout de cartão.
 *
 * REVERSÃO: por padrão (flag ausente/false) o app fica EXATAMENTE como antes —
 * cartão abre a página hospedada do Mercado Pago (Checkout Pro) via redirect.
 *
 * Para ativar a tela embutida (Payment Brick, responsiva no celular), defina no
 * .env:
 *     VITE_MP_EMBEDDED_CHECKOUT=true
 * e reinicie o servidor. Para voltar ao estado de agora, remova a env ou use
 * "false". Requer também a Edge Function payments-charge atualizada e a
 * VITE_MERCADOPAGO_PUBLIC_KEY configurada.
 */
export function isEmbeddedCardCheckout(): boolean {
  return import.meta.env.VITE_MP_EMBEDDED_CHECKOUT === "true";
}

/** Chave pública do Mercado Pago (tokenização client-side). */
export function mercadoPagoPublicKey(): string | undefined {
  const k = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;
  return k && k.trim() ? k.trim() : undefined;
}
