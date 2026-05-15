/**
 * usePaymentsOrchestrator — orquestrador de pagamentos da Fase 1.
 *
 * É o hook que a UI chama. Por baixo:
 *  1. Lê o driver ativo do `gatewayStorage`
 *  2. Chama charge/payout/refund do driver
 *  3. Registra entries no ledger local (Fase 1) ou no banco (Fase 1-DB)
 *  4. Aplica idempotência
 *
 * QUANDO O BANCO ESTIVER PRONTO: trocar a chamada do `postTransaction` local
 * pelo RPC equivalente (`pay_post_transaction` no banco). Nada mais muda.
 *
 * NOTA: existe um hook legado `usePayments.ts` para outra finalidade
 *       (manual recharge/payouts). Este aqui é a nova camada gateway-driven.
 */

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gatewayStorage } from '@/lib/payments/storage';
import { getDriver } from '@/lib/payments/registry';
import {
  postTransaction,
  computeBalance,
  getOrCreateAccount,
} from '@/lib/payments/local-ledger';
import { newIdempotencyKey } from '@/lib/payments/idempotency';
import type {
  ChargeResult,
  PayoutResult,
  PayoutParams,
  ProviderContext,
} from '@/lib/payments';

async function getActiveContext(): Promise<{
  driver: ReturnType<typeof getDriver>;
  context: ProviderContext;
}> {
  const active = await gatewayStorage.getActive();
  if (!active) {
    throw new Error(
      'Nenhum gateway ativo. Configure em /admin/pagamentos/gateways.',
    );
  }
  return {
    driver: getDriver(active.provider_code),
    context: {
      mode: active.mode,
      credentials: active.credentials,
      config: active.config,
    },
  };
}

const LEDGER_QUERY_KEY = ['local-ledger'] as const;

export function usePaymentsOrchestrator() {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
  }, [queryClient]);

  /** Lojista compra pacote — CREDIT na conta de créditos */
  const purchaseCredits = useMutation({
    mutationFn: async (input: {
      merchant_user_id: string;
      package_credits: number;
      package_price_cents: number;
      package_name: string;
    }): Promise<{ charge: ChargeResult; ledger_tx_id: string }> => {
      const idempotency_key = newIdempotencyKey();
      const { driver, context } = await getActiveContext();

      const charge = await driver.charge(
        {
          idempotency_key,
          service_type: 'credit_purchase',
          payer_user_id: input.merchant_user_id,
          amount: { amount_cents: input.package_price_cents, currency: 'BRL' },
          method: 'pix',
          reference_type: 'credit_package',
          reference_id: input.package_name,
          description: `Compra: ${input.package_name}`,
        },
        context,
      );

      if (charge.status === 'failed') {
        throw new Error(charge.error_message ?? 'Falha na cobrança');
      }

      let ledger_tx_id = '';
      if (charge.status === 'paid') {
        const merchant = getOrCreateAccount(
          'merchant_credits',
          input.merchant_user_id,
          `Lojista ${input.merchant_user_id.slice(0, 6)}`,
        );
        const gateway = getOrCreateAccount(
          'gateway_clearing',
          null,
          'Gateway Clearing',
        );
        const tx = postTransaction({
          idempotency_key: `ledger:${idempotency_key}`,
          operation: 'credit_purchase',
          description: `Pacote ${input.package_name} (${input.package_credits} créditos)`,
          entries: [
            {
              account_id: gateway.id,
              entry_type: 'DEBIT',
              amount_cents: input.package_credits,
              reference_type: 'credit_purchase',
              reference_id: charge.charge_id,
            },
            {
              account_id: merchant.id,
              entry_type: 'CREDIT',
              amount_cents: input.package_credits,
              reference_type: 'credit_purchase',
              reference_id: charge.charge_id,
              metadata: {
                package_name: input.package_name,
                price_brl: input.package_price_cents / 100,
              },
            },
          ],
        });
        ledger_tx_id = tx.transaction_id;
      }
      return { charge, ledger_tx_id };
    },
    onSuccess: invalidate,
  });

  /** Lojista chama motoboy — HOLD de créditos */
  const requestDelivery = useMutation({
    mutationFn: async (input: {
      merchant_user_id: string;
      motoboy_user_id: string;
      credits_cost: number;
      delivery_id: string;
      description?: string;
    }): Promise<{ hold_entry_id: string; ledger_tx_id: string }> => {
      const idempotency_key = newIdempotencyKey();
      const merchant = getOrCreateAccount(
        'merchant_credits',
        input.merchant_user_id,
        `Lojista ${input.merchant_user_id.slice(0, 6)}`,
      );
      const escrow = getOrCreateAccount(
        'platform_escrow',
        null,
        'Escrow Plataforma',
      );
      const balance = computeBalance(merchant.id);
      if (balance.available_cents < input.credits_cost) {
        throw new Error(
          `Saldo insuficiente. Disponível: ${balance.available_cents} | Necessário: ${input.credits_cost}`,
        );
      }
      const tx = postTransaction({
        idempotency_key: `ledger:${idempotency_key}`,
        operation: 'delivery_request',
        description:
          input.description ?? `Chamada motoboy — entrega ${input.delivery_id}`,
        entries: [
          {
            account_id: merchant.id,
            entry_type: 'HOLD',
            amount_cents: input.credits_cost,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            metadata: { motoboy_user_id: input.motoboy_user_id },
          },
          {
            account_id: escrow.id,
            entry_type: 'CREDIT',
            amount_cents: input.credits_cost,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
        ],
      });
      return { hold_entry_id: tx.entries[0].id, ledger_tx_id: tx.transaction_id };
    },
    onSuccess: invalidate,
  });

  /** Entrega concluída — RELEASE → motoboy CREDIT + comissão pra plataforma */
  const completeDelivery = useMutation({
    mutationFn: async (input: {
      hold_entry_id: string;
      merchant_user_id: string;
      motoboy_user_id: string;
      credits_cost: number;
      platform_fee_cents: number;
      delivery_id: string;
    }): Promise<{ ledger_tx_id: string }> => {
      const idempotency_key = newIdempotencyKey();
      const merchant = getOrCreateAccount(
        'merchant_credits',
        input.merchant_user_id,
        `Lojista ${input.merchant_user_id.slice(0, 6)}`,
      );
      const escrow = getOrCreateAccount(
        'platform_escrow',
        null,
        'Escrow Plataforma',
      );
      const motoboy = getOrCreateAccount(
        'motoboy',
        input.motoboy_user_id,
        `Motoboy ${input.motoboy_user_id.slice(0, 6)}`,
      );
      const revenue = getOrCreateAccount(
        'platform_revenue',
        null,
        'Receita Plataforma',
      );

      const net = input.credits_cost - input.platform_fee_cents;

      const tx = postTransaction({
        idempotency_key: `ledger:${idempotency_key}`,
        operation: 'delivery_complete',
        description: `Entrega ${input.delivery_id} concluída`,
        entries: [
          {
            account_id: merchant.id,
            entry_type: 'RELEASE',
            amount_cents: input.credits_cost,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            parent_entry_id: input.hold_entry_id,
          },
          {
            account_id: escrow.id,
            entry_type: 'DEBIT',
            amount_cents: input.credits_cost,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
          {
            account_id: motoboy.id,
            entry_type: 'CREDIT',
            amount_cents: net,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            metadata: { gross: input.credits_cost, fee: input.platform_fee_cents },
          },
          {
            account_id: revenue.id,
            entry_type: 'CREDIT',
            amount_cents: input.platform_fee_cents,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            metadata: { kind: 'commission' },
          },
        ],
      });
      return { ledger_tx_id: tx.transaction_id };
    },
    onSuccess: invalidate,
  });

  /** Cancela entrega — REFUND do HOLD pro lojista */
  const cancelDelivery = useMutation({
    mutationFn: async (input: {
      hold_entry_id: string;
      merchant_user_id: string;
      credits_cost: number;
      delivery_id: string;
      reason: string;
    }): Promise<{ ledger_tx_id: string }> => {
      const idempotency_key = newIdempotencyKey();
      const merchant = getOrCreateAccount(
        'merchant_credits',
        input.merchant_user_id,
        `Lojista ${input.merchant_user_id.slice(0, 6)}`,
      );
      const escrow = getOrCreateAccount(
        'platform_escrow',
        null,
        'Escrow Plataforma',
      );
      const tx = postTransaction({
        idempotency_key: `ledger:${idempotency_key}`,
        operation: 'delivery_cancel',
        description: `Entrega ${input.delivery_id} cancelada — ${input.reason}`,
        entries: [
          {
            account_id: merchant.id,
            entry_type: 'REFUND',
            amount_cents: input.credits_cost,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
            parent_entry_id: input.hold_entry_id,
            metadata: { reason: input.reason },
          },
          {
            account_id: escrow.id,
            entry_type: 'DEBIT',
            amount_cents: input.credits_cost,
            reference_type: 'delivery',
            reference_id: input.delivery_id,
          },
        ],
      });
      return { ledger_tx_id: tx.transaction_id };
    },
    onSuccess: invalidate,
  });

  /** Motoboy saca PIX — PAYOUT */
  const requestPayout = useMutation({
    mutationFn: async (input: {
      motoboy_user_id: string;
      amount_cents: number;
      pix_key: string;
      pix_key_type: PayoutParams['pix_key_type'];
    }): Promise<{ payout: PayoutResult; ledger_tx_id: string }> => {
      const idempotency_key = newIdempotencyKey();
      const { driver, context } = await getActiveContext();

      const motoboy = getOrCreateAccount(
        'motoboy',
        input.motoboy_user_id,
        `Motoboy ${input.motoboy_user_id.slice(0, 6)}`,
      );
      const gateway = getOrCreateAccount(
        'gateway_clearing',
        null,
        'Gateway Clearing',
      );
      const balance = computeBalance(motoboy.id);
      if (balance.available_cents < input.amount_cents) {
        throw new Error(
          `Saldo insuficiente. Disponível: ${balance.available_cents} | Solicitado: ${input.amount_cents}`,
        );
      }

      const payout = await driver.payout(
        {
          idempotency_key,
          recipient_user_id: input.motoboy_user_id,
          amount: { amount_cents: input.amount_cents, currency: 'BRL' },
          pix_key: input.pix_key,
          pix_key_type: input.pix_key_type,
          description: `Saque motoboy ${input.motoboy_user_id.slice(0, 6)}`,
        },
        context,
      );

      if (payout.status === 'failed' || payout.status === 'rejected') {
        throw new Error(payout.error_message ?? 'Falha no saque');
      }

      const tx = postTransaction({
        idempotency_key: `ledger:${idempotency_key}`,
        operation: 'payout_request',
        description: `Saque PIX ${input.pix_key_type}`,
        entries: [
          {
            account_id: motoboy.id,
            entry_type: 'PAYOUT',
            amount_cents: input.amount_cents,
            reference_type: 'payout',
            reference_id: payout.payout_id,
            metadata: {
              pix_key_type: input.pix_key_type,
              external_id: payout.external_id,
            },
          },
          {
            account_id: gateway.id,
            entry_type: 'CREDIT',
            amount_cents: input.amount_cents,
            reference_type: 'payout',
            reference_id: payout.payout_id,
          },
        ],
      });
      return { payout, ledger_tx_id: tx.transaction_id };
    },
    onSuccess: invalidate,
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
      cancelDelivery.isPending ||
      requestPayout.isPending,
  };
}
