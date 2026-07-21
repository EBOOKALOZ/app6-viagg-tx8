/**
 * 🔓 unlockContact — API ÚNICA de desbloqueio de contato (Wallet Core)
 *
 * TODA a plataforma usa esta função para liberar um comprador interessado.
 * Debita 2% do valor anunciado da carteira do VENDEDOR (`wallets`, via
 * `wallet_reserve` + `wallet_confirm`), de forma PERMANENTE por
 * (módulo, anúncio, comprador). Nunca recobra o mesmo comprador no mesmo
 * anúncio. Proibido criar funções específicas por módulo — sempre esta.
 *
 * @param module        'product' | 'real_estate' | 'vehicles' | 'services' | 'freight' | ...
 * @param listingId     id do anúncio
 * @param buyerKey      identidade estável do comprador (telefone normalizado ou user_id)
 * @param valueHintCents valor anunciado em CENTS — usado quando o anúncio não
 *                       resolve o valor numérico no banco (ex.: produtos com price_label livre)
 */
import { supabase } from "@/integrations/supabase/client";

export interface UnlockContactResult {
  success: boolean;
  already_unlocked?: boolean;
  permanent?: boolean;
  charged_cents?: number;
  balance_cents?: number;
  note?: string;
  error?: string;
  buy_credits_cta?: boolean;
  required_cents?: number;
  available_cents?: number;
}

export async function unlockContact(
  module: string,
  listingId: string,
  buyerKey: string,
  valueHintCents?: number | null,
): Promise<UnlockContactResult> {
  const { data, error } = await (supabase.rpc as any)("wallet_unlock_contact", {
    p_module: module,
    p_listing_id: listingId,
    p_buyer_key: buyerKey,
    p_value_hint_cents: valueHintCents ?? null,
  });
  if (error) return { success: false, error: error.message };
  return (data ?? { success: false, error: "empty_response" }) as UnlockContactResult;
}

/** cents → "R$ 1.234,56" */
export function centsToBRL(cents?: number | null): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
