/**
 * usePaymentsOrchestrator — Fase 2: persistência no banco (pay_*).
 *
 * Mudança vs. Fase 1: NÃO usa mais o local-ledger (memória do browser).
 *
 *  - purchaseCredits → Edge Function `payments-charge` (cria pay_payment_order
 *    + cobrança no gateway; o crédito do saldo só ocorre quando o webhook
 *    confirmar o pagamento — ver supabase/functions/payments-webhook).
 *  - requestDelivery / completeDelivery / cancelDelivery → double-entry via
 *    RPC `pay_post_transaction` (merchant_wallet ↔ platform_escrow ↔
 *    motoboy_wallet ↔ platform_main).
 *  - requestPayout → ainda NÃO migrado (precisa de RPC de criação de
 *    pay_payout_requests; cai na Prioridade 6 — telas/admin de saques).
 *    Lança erro explícito em vez de mover dinheiro pela metade.
 *
 * Unidades: a UI trabalha em CENTAVOS; o ledger pay_* é em REAIS (numeric).
 * A conversão centavos→reais (÷100) acontece aqui, na borda.
 *
 * Identidade de conta: o chamador deve passar o owner_id correto
 * (merchant_store.id / motoboy_profile.id), não o auth user id.
 */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { newIdempotencyKey } from '@/lib/payments/idempotency';
import type { ChargeResult, PayoutParams } from '@/lib/payments';

const PAY_QUERY_KEY = ['pay-balances'] as const;

/** Converte centavos (UI) → reais (DB). */
function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

type PayOwnerType = 'platform' | 'merchant_store' | 'motoboy_profile';
type PayAccountType =
  | 'platform_main'
  | 'platform_reserve'
  | 'platform_escrow'
  | 'merchant_wallet'
  | 'motoboy_wallet';

/** Resolve (ou cria) a conta financeira e devolve seu id. */
async function accountId(
  ownerType: PayOwnerType,
  ownerId: string | null,
  accountType: PayAccountType,
): Promise<string> {
  const { data, error } = await (supabase.rpc as any)(
    'pay_get_or_create_account',
    {
      p_owner_type: ownerType,
      p_owner_id: ownerId,
      p_account_type: accountType,
      p_metadata: {},
    },
  );
  if (error) throw new Error(`Conta (${accountType}): ${error.message}`);
  return (data as { id: string }).id;
}

interface LedgerEntryInput {
  account_id: string;
  direction: 'credit' | 'debit';
  entry_type: string;
  amount: number; // reais
  reference_type?: string;
  reference_id?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

async function postTransaction(
  scope: string,
  idempotencyKey: string,
  entries: LedgerEntryInput[],
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await (supabase.rpc as any)('pay_post_transaction', {
    p_scope: scope,
    p_idempotency_key: idempotencyKey,
    p_entries: entries,
    p_metadata: metadata,
  });
  if (error) throw new Error(`pay_post_transaction: ${error.message}`);
  const res = data as { entry_ids?: string[] };
  return res?.entry_ids?.[0] ?? '';
}

export function usePaymentsOrchestrator() {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: PAY_QUERY_KEY });
  }, [queryClient]);

  /**
   * Lojista compra pacote — cria a ordem + cobrança no gateway.
   * O saldo NÃO é creditado aqui; só quando o webhook confirmar (PIX pago).
   */
  const purchaseCredits = useMutation({
    mutationFn: async (input: {
      merchant_owner_id: string; // store/owner id da conta pay destino
      package_price_cents: number;
      package_name: string;
      package_credits?: number;
      method?: 'pix' | 'credit_card' | 'boleto';
      payer_email?: string;
      /** 'merchant_store' (default) | 'platform' | 'motoboy_profile' */
      payer_owner_type?: string;
      /** conta pay destino (default merchant_wallet) */
      account_type?: string;
      /**
       * Ponte p/ concessão legada: { grant_kind, <ref>_id }.
       * Ex: { grant_kind:'real_estate', real_estate_purchase_id:'...' }
       */
      metadata?: Record<string, unknown>;
      /**
       * Dados tokenizados do Payment Brick (cartão) p/ cobrar direto via
       * /v1/payments. Quando presente, o backend ignora o Checkout Pro.
       */
      card?: Record<string, unknown>;
    }): Promise<{
      order_id: string;
      status: string;
      charge: ChargeResult;
    }> => {
      const idempotency_key = newIdempotencyKey();
      const { data, error } = await supabase.functions.invoke(
        'payments-charge',
        {
          body: {
            payer_owner_type: input.payer_owner_type ?? 'merchant_store',
            payer_owner_id: input.merchant_owner_id,
            account_type: input.account_type ?? 'merchant_wallet',
            amount_cents: input.package_price_cents,
            method: input.method ?? 'pix',
            description: `Compra: ${input.package_name}`,
            reference_type: 'credit_package',
            reference_id: null,
            product_type: 'credit_package',
            product_snapshot: {
              package_name: input.package_name,
              package_credits: input.package_credits ?? null,
              price_brl: toReais(input.package_price_cents),
            },
            payer_email: input.payer_email,
            metadata: input.metadata ?? {},
            ...(input.card ? { card: input.card } : {}),
            idempotency_key,
          },
        },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) {
        throw new Error(data?.error ?? 'Falha ao gerar cobrança.');
      }
      const charge: ChargeResult = {
        charge_id: data.order_id,
        external_id: data.provider_payment_id ?? null,
        status: 'pending',
        payment_payload: {
          pix_qr_base64: data.pix_qr_base64 ?? undefined,
          pix_copy_paste: data.pix_copy_paste ?? undefined,
          checkout_url: data.checkout_url ?? undefined,
        },
        expires_at: data.expires_at ?? undefined,
      };
      return { order_id: data.order_id, status: data.status, charge };
    },
    onSuccess: invalidate,
  });

  /** Lojista chama motoboy — transfere crédito merchant → escrow. */
  const requestDelivery = useMutation({
    mutationFn: async (input: {
      merchant_owner_id: string;
      credits_cost_cents: number;
      delivery_id: string;
      motoboy_owner_id?: string;
      description?: string;
    }): Promise<{ ledger_entry_id: string }> => {
      const idempotency_key = `delivery_request:${input.delivery_id}`;
      const amount = toReais(input.credits_cost_cents);
      const merchant = await accountId(
        'merchant_store',
        input.merchant_owner_id,
        'merchant_wallet',
      );
      const escrow = await accountId('platform', null, 'platform_escrow');
      const id = await postTransaction(
        'delivery_request',
        idempotency_key,
        [
          {
            account_id: merchant,
            direction: 'debit',
            entry_type: 'payment_out',
            amount,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            description:
              input.description ?? `Reserva entrega ${input.delivery_id}`,
            metadata: { motoboy_owner_id: input.motoboy_owner_id },
          },
          {
            account_id: escrow,
            direction: 'credit',
            entry_type: 'payment_in',
            amount,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
        ],
      );
      return { ledger_entry_id: id };
    },
    onSuccess: invalidate,
  });

  /** Entrega concluída — escrow → motoboy (líquido) + plataforma (comissão). */
  const completeDelivery = useMutation({
    mutationFn: async (input: {
      motoboy_owner_id: string;
      credits_cost_cents: number;
      platform_fee_cents: number;
      delivery_id: string;
    }): Promise<{ ledger_entry_id: string }> => {
      const idempotency_key = `delivery_complete:${input.delivery_id}`;
      const gross = toReais(input.credits_cost_cents);
      const fee = toReais(input.platform_fee_cents);
      const net = gross - fee;
      const escrow = await accountId('platform', null, 'platform_escrow');
      const motoboy = await accountId(
        'motoboy_profile',
        input.motoboy_owner_id,
        'motoboy_wallet',
      );
      const platform = await accountId('platform', null, 'platform_main');
      const id = await postTransaction(
        'delivery_complete',
        idempotency_key,
        [
          {
            account_id: escrow,
            direction: 'debit',
            entry_type: 'payment_out',
            amount: gross,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
          {
            account_id: motoboy,
            direction: 'credit',
            entry_type: 'motoboy_earning',
            amount: net,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            metadata: { gross, fee },
          },
          {
            account_id: platform,
            direction: 'credit',
            entry_type: 'commission_income',
            amount: fee,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
        ],
      );
      return { ledger_entry_id: id };
    },
    onSuccess: invalidate,
  });

  /** Cancela entrega — devolve o escrow pro lojista. */
  const cancelDelivery = useMutation({
    mutationFn: async (input: {
      merchant_owner_id: string;
      credits_cost_cents: number;
      delivery_id: string;
      reason: string;
    }): Promise<{ ledger_entry_id: string }> => {
      const idempotency_key = `delivery_cancel:${input.delivery_id}`;
      const amount = toReais(input.credits_cost_cents);
      const merchant = await accountId(
        'merchant_store',
        input.merchant_owner_id,
        'merchant_wallet',
      );
      const escrow = await accountId('platform', null, 'platform_escrow');
      const id = await postTransaction(
        'delivery_cancel',
        idempotency_key,
        [
          {
            account_id: escrow,
            direction: 'debit',
            entry_type: 'payment_out',
            amount,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
          {
            account_id: merchant,
            direction: 'credit',
            entry_type: 'refund',
            amount,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            metadata: { reason: input.reason },
          },
        ],
      );
      return { ledger_entry_id: id };
    },
    onSuccess: invalidate,
  });

  /**
   * Saque do motoboy — NÃO migrado nesta fase.
   *
   * Falta a RPC de criação de pay_payout_requests (entra na Prioridade 6,
   * telas/admin de saques). Reservar saldo sem criar a solicitação deixaria
   * fundos presos sem caminho de liberação — então falhamos explicitamente
   * em vez de mover dinheiro pela metade.
   */
  const requestPayout = useMutation({
    mutationFn: async (_input: {
      motoboy_owner_id: string;
      amount_cents: number;
      pix_key: string;
      pix_key_type: PayoutParams['pix_key_type'];
    }): Promise<never> => {
      throw new Error(
        'Saque ainda não disponível: criação de pay_payout_requests é da ' +
          'Prioridade 6 (admin de saques). Não implementado na Fase 2.',
      );
    },
  });

  return {
    purchaseCredits: purchaseCredits.mutateAsync,
    requestDelivery: requestDelivery.mutateAsync,
    completeDelivery: completeDelivery.mutateAsync,
    cancelDelivery: cancelDelivery.mutateAsync,
    requestPayout: requestPayout.mutateAsync,
    isPending:
      purchaseCredits.isPending ||
      requestDelivery.isPending ||
      completeDelivery.isPending ||
      cancelDelivery.isPending,
  };
}
