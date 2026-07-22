/**
 * 🔓 unlockContact — API ÚNICA de desbloqueio de contato (motor pay_*)
 *
 * TODA a plataforma usa esta função para liberar um comprador interessado.
 * Fluxo oficial (unificação AI-75.3, 2026-07-21):
 *   wallet_reveal_contact → wallet_unlock_contact → pay_post_transaction
 * Debita 2% do valor anunciado (orion_commission_policy; piso/teto no banco)
 * da CARTEIRA OFICIAL do vendedor (pay_financial_accounts, customer_wallet)
 * com partida dobrada p/ platform_main — PERMANENTE por (módulo, anúncio,
 * comprador). Nunca recobra o mesmo comprador no mesmo anúncio.
 * O Wallet Core legado (wallets/wallet_transactions) está DESATIVADO.
 * Proibido criar funções específicas por módulo — sempre esta.
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

/**
 * 💰 quoteUnlockContact — COTAÇÃO da comissão de liberação, SEM debitar.
 *
 * Chama a RPC oficial `wallet_unlock_charge_cents` (STABLE, autorizada p/
 * authenticated) que é a FONTE ÚNICA do valor: lê `orion_commission_policy`
 * (percentual + piso + teto) e aplica ao valor do anúncio/hint. O front NUNCA
 * calcula o percentual — apenas exibe o que o backend devolve.
 *
 * Retorna o custo em CENTS (o mesmo que será debitado no unlock), ou null se
 * não houver política/valor. Idempotente e barato (pode ser chamado por card).
 */
export async function quoteUnlockContact(
  module: string,
  listingId: string,
  valueHintCents?: number | null,
): Promise<number | null> {
  const { data, error } = await (supabase.rpc as any)("wallet_unlock_charge_cents", {
    p_module: module,
    p_listing_id: listingId,
    p_value_hint_cents: valueHintCents ?? null,
  });
  if (error) return null;
  const cents = Number(data);
  return Number.isFinite(cents) ? cents : null;
}

export interface RevealContactResult extends UnlockContactResult {
  visitor_name?: string | null;
  visitor_phone?: string | null;
  visitor_message?: string | null;
  whatsapp_url?: string | null;
}

/**
 * 🔐 revealContact — PORTA ÚNICA da PII (P0/LGPD 07-21).
 * O banco não entrega mais visitor_phone/name/message em SELECT (lockdown de
 * coluna); o telefone SÓ sai por esta RPC, após a autorização financeira
 * (que REUSA wallet_unlock_contact — idempotente/permanente, nunca recobra).
 * Para intenções de contato (advertiser_contact_intentions), use SEMPRE esta.
 */
export async function revealContact(
  intentionId: string,
  valueHintCents?: number | null,
): Promise<RevealContactResult> {
  const { data, error } = await (supabase.rpc as any)("wallet_reveal_contact", {
    p_intention_id: intentionId,
    p_value_hint_cents: valueHintCents ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = (data ?? { success: false, error: "empty_response" }) as RevealContactResult;
  if (r.success) {
    revealedPII.set(intentionId, {
      visitor_phone: r.visitor_phone ?? null,
      visitor_name: r.visitor_name ?? null,
      visitor_message: r.visitor_message ?? null,
    });
  }
  return r;
}

/**
 * PII revelada NESTA sessão (por intenção). O banco não devolve mais o telefone
 * em SELECT — os hooks mesclam este cache nas linhas para a UI exibir após o
 * reveal. Recarregou a página? O "ver contato" chama o reveal de novo (grátis,
 * idempotente) — nunca há telefone dormindo no payload.
 */
export const revealedPII = new Map<string, {
  visitor_phone?: string | null; visitor_name?: string | null; visitor_message?: string | null;
}>();

/** cents → "R$ 1.234,56" */
export function centsToBRL(cents?: number | null): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
