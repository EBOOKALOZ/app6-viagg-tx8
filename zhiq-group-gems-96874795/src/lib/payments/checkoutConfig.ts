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
  // DESATIVADO em 2026-07-11: o Payment Brick embutido travava em
  // "Carregando…" no navegador do usuário (funciona em Chrome limpo —
  // diagnóstico via /teste-brick), então o cartão volta ao Checkout Pro
  // hospedado do MP, que é o fluxo original e estável. Para reativar o
  // embutido, volte a retornar a condição da env abaixo.
  return false;
  // return import.meta.env.VITE_MP_EMBEDDED_CHECKOUT === "true";
}

/** Chave pública do Mercado Pago (tokenização client-side). */
export function mercadoPagoPublicKey(): string | undefined {
  const k = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;
  return k && k.trim() ? k.trim() : undefined;
}

/**
 * FASE 1 — config central de checkout: busca ambiente ativo + public key da
 * Configuração Mercado Pago (RPC mp_get_checkout_public_config; a public key
 * é pública por natureza, nunca expõe secrets). Fallback: VITE_* (comportamento
 * atual), garantindo zero quebra enquanto a migration não for aplicada.
 */
export async function fetchMercadoPagoCheckoutConfig(): Promise<{
  environment: "sandbox" | "production";
  publicKey: string | undefined;
}> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      "mp_get_checkout_public_config",
    );
    if (!error && data && typeof data === "object") {
      const d = data as { environment?: string; public_key?: string | null };
      const env = d.environment === "production" ? "production" : "sandbox";
      const pk = d.public_key && d.public_key.trim()
        ? d.public_key.trim()
        : mercadoPagoPublicKey();
      return { environment: env, publicKey: pk };
    }
  } catch {
    // RPC ausente (migration não aplicada) → segue no fallback
  }
  return { environment: "sandbox", publicKey: mercadoPagoPublicKey() };
}
