/**
 * 💸 debitSellerCredits — Helper genérico de débito de créditos do lojista
 *
 * Lê o saldo atual em `advertiser_credit_balances`, decrementa `available_credits`,
 * incrementa `consumed_credits` e registra entrada em `advertiser_credit_ledger`.
 *
 * Resolve o `advertiser_account_id` automaticamente a partir de:
 *   - advertiserAccountId (passado direto), ou
 *   - userId (do usuário logado), ou
 *   - storeId (productId/merchant_store_id → busca o dono)
 */
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_COSTS, CREDIT_EVENT_LABELS, CreditEvent } from "./creditPricing";

export interface DebitSellerCreditsArgs {
  event: CreditEvent;
  /** Direto: id da conta de advertiser_accounts (mais rápido) */
  advertiserAccountId?: string | null;
  /** Alternativa: user_id do dono — busca account_id no Supabase */
  userId?: string | null;
  /** Alternativa: storeId (merchant_stores.id OU advertiser_accounts.id) */
  storeId?: string | null;
  /** Para o ledger — id do recurso afetado (oferta, pedido, lead, etc.) */
  refType?: string;
  refId?: string;
  /** Override de quantidade (raro — geralmente usa CREDIT_COSTS[event]) */
  amountOverride?: number;
  /** Descrição extra pro ledger */
  extraDescription?: string;
}

export interface DebitSellerCreditsResult {
  charged: boolean;
  reason?: string;
  credits_charged?: number;
  balance_after?: number;
  required?: number;
  available?: number;
}

const sessionDedupe = new Set<string>();

export async function debitSellerCredits(args: DebitSellerCreditsArgs): Promise<DebitSellerCreditsResult> {
  const amount = args.amountOverride ?? CREDIT_COSTS[args.event];
  if (!amount || amount <= 0) return { charged: false, reason: "no_amount_configured" };

  // Dedupe por (event + refId) em uma janela de sessão — evita cobrar 2x rapidamente
  const dedupeKey = `${args.event}:${args.refId ?? "_"}`;
  if (sessionDedupe.has(dedupeKey)) {
    return { charged: false, reason: "deduped_in_session" };
  }

  // Resolve advertiser_account_id
  let accId = args.advertiserAccountId;
  if (!accId && args.userId) {
    const { data: adv } = await (supabase.from("advertiser_accounts" as any)
      .select("id").eq("user_id", args.userId).maybeSingle()) as any;
    accId = (adv as any)?.id ?? null;
  }
  if (!accId && args.storeId) {
    // Tenta como advertiser_accounts.id direto
    const { data: advDirect } = await (supabase.from("advertiser_accounts" as any)
      .select("id").eq("id", args.storeId).maybeSingle()) as any;
    if ((advDirect as any)?.id) accId = (advDirect as any).id;
    if (!accId) {
      // Fallback: storeId é merchant_stores.id → pega o user_id e busca a advertiser_account
      const { data: ms } = await (supabase.from("merchant_stores" as any)
        .select("user_id").eq("id", args.storeId).maybeSingle()) as any;
      const ownerUserId = (ms as any)?.user_id;
      if (ownerUserId) {
        const { data: adv } = await (supabase.from("advertiser_accounts" as any)
          .select("id").eq("user_id", ownerUserId).maybeSingle()) as any;
        accId = (adv as any)?.id ?? null;
      }
    }
  }
  if (!accId) return { charged: false, reason: "advertiser_not_found" };

  // Lê saldo atual
  const { data: bal } = await (supabase.from("advertiser_credit_balances" as any)
    .select("available_credits, consumed_credits")
    .eq("advertiser_account_id", accId)
    .maybeSingle()) as any;

  const available = Number((bal as any)?.available_credits ?? 0);
  const consumed = Number((bal as any)?.consumed_credits ?? 0);

  if (available < amount) {
    return { charged: false, reason: "insufficient_credits", required: amount, available };
  }

  // UPDATE saldo
  const { error: updErr } = await (supabase.from("advertiser_credit_balances" as any)
    .update({
      available_credits: available - amount,
      consumed_credits: consumed + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("advertiser_account_id", accId)) as any;

  if (updErr) {
    console.error("[debitSellerCredits] update falhou:", updErr);
    return { charged: false, reason: updErr.message };
  }

  // INSERT no ledger (não bloqueia). entry_type/balance_* são NOT NULL;
  // ref_type/ref_id vão em metadata (a tabela não tem essas colunas).
  // Toda inserção aqui dispara o trigger trg_notify_advertiser_on_ledger,
  // que envia o e-mail de notificação ao lojista.
  await (supabase.from("advertiser_credit_ledger" as any).insert({
    advertiser_account_id: accId,
    entry_type: "debit",
    amount: -amount,
    balance_before: available,
    balance_after: available - amount,
    reason_code: args.event,
    description: args.extraDescription
      ? `${CREDIT_EVENT_LABELS[args.event]} — ${args.extraDescription}`
      : CREDIT_EVENT_LABELS[args.event],
    metadata: { ref_type: args.refType ?? null, ref_id: args.refId ?? null },
  })) as any;

  sessionDedupe.add(dedupeKey);
  return { charged: true, credits_charged: amount, balance_after: available - amount };
}
