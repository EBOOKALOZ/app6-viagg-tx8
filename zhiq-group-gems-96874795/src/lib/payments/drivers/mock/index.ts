/**
 * Mock Payment Driver
 *
 * Simula todo o ciclo de pagamento sem chamar gateway externo. Permite
 * desenvolver e testar a carteira/escrow ponta-a-ponta antes do gateway real.
 *
 * Comportamento:
 *  - charge() retorna 'pending' e auto-confirma após N segundos
 *  - payout() retorna 'processing' e auto-confirma
 *  - refund() retorna 'processed' imediatamente
 *  - validateWebhook() aceita qualquer body, normaliza um evento
 *  - testConnection() sempre retorna ok
 *
 * Em produção este driver é BLOQUEADO (não pode ser is_active=true).
 */

import type {
  ChargeParams,
  ChargeResult,
  PayoutParams,
  PayoutResult,
  RefundParams,
  RefundResult,
  TransactionStatusResult,
  WebhookValidationParams,
  WebhookValidationResult,
  PaymentProvider,
  ProviderContext,
  ChargeStatus,
} from '../../types';

/**
 * O Mock NÃO armazena estado local — em produção real (mesmo no Mock)
 * o estado vive no banco (payment_gateways + pay_ledger_entries).
 * Estas funções apenas formatam payloads e simulam latência.
 */

function mockExternalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mockPixQrCode(): { pix_qr_base64: string; pix_copy_paste: string } {
  // Em produção, o Mock gera um QR code "fake" — só pra UI mostrar algo.
  // Não é um PIX válido.
  return {
    pix_qr_base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    pix_copy_paste:
      '00020101021126360014BR.GOV.BCB.PIX0114+555000000000052040000530398654041.005802BR5905MOCKS6009SAOPAULO62070503***6304MOCK',
  };
}

export const mockDriver: PaymentProvider = {
  code: 'mock',

  async charge(params: ChargeParams, ctx: ProviderContext): Promise<ChargeResult> {
    // Bloqueio: Mock em produção NÃO cobra.
    if (ctx.mode === 'production') {
      return {
        charge_id: '',
        external_id: null,
        status: 'failed',
        error_message:
          'Mock driver é bloqueado em produção. Ative um gateway real.',
      };
    }

    // Force failure para testar UI de erro.
    if (ctx.config.mock_force_failure) {
      return {
        charge_id: mockExternalId('mock_chg'),
        external_id: null,
        status: 'failed',
        error_message: 'Falha simulada (mock_force_failure=true).',
      };
    }

    const external_id = mockExternalId('mock_chg');
    const auto_confirm = ctx.config.mock_auto_confirm_seconds ?? 0;

    // Decide status inicial conforme método e config de auto-confirm
    let status: ChargeStatus = 'pending';
    if (params.method === 'wallet_internal') {
      // Pagamento com saldo interno: confirma na hora
      status = 'paid';
    } else if (auto_confirm === 0) {
      status = 'paid'; // instantâneo
    }

    return {
      charge_id: external_id,
      external_id,
      status,
      payment_payload:
        params.method === 'pix'
          ? mockPixQrCode()
          : params.method === 'credit_card'
            ? { checkout_url: `https://mock.viagg.local/checkout/${external_id}` }
            : undefined,
      expires_at:
        params.method === 'pix'
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : undefined,
    };
  },

  async payout(params: PayoutParams, ctx: ProviderContext): Promise<PayoutResult> {
    if (ctx.mode === 'production') {
      return {
        payout_id: '',
        external_id: null,
        status: 'failed',
        error_message: 'Mock driver é bloqueado em produção.',
      };
    }

    if (ctx.config.mock_force_failure) {
      return {
        payout_id: mockExternalId('mock_pay'),
        external_id: null,
        status: 'failed',
        error_message: 'Falha simulada de saque.',
      };
    }

    const external_id = mockExternalId('mock_pay');
    const auto_confirm = ctx.config.mock_auto_confirm_seconds ?? 0;

    return {
      payout_id: external_id,
      external_id,
      status: auto_confirm === 0 ? 'paid' : 'processing',
      end_to_end_id: `E${Date.now()}MOCK`,
    };
  },

  async refund(params: RefundParams, ctx: ProviderContext): Promise<RefundResult> {
    if (ctx.mode === 'production') {
      return {
        refund_id: '',
        external_id: null,
        status: 'failed',
        error_message: 'Mock driver é bloqueado em produção.',
      };
    }

    const external_id = mockExternalId('mock_ref');
    return {
      refund_id: external_id,
      external_id,
      status: 'processed',
    };
  },

  async getTransactionStatus(
    external_id: string,
    _ctx: ProviderContext,
  ): Promise<TransactionStatusResult> {
    return {
      external_id,
      status: 'paid',
      raw: { _mock: true, external_id },
    };
  },

  async validateWebhook(
    params: WebhookValidationParams,
    _ctx: ProviderContext,
  ): Promise<WebhookValidationResult> {
    // Mock: aceita qualquer payload JSON e tenta extrair event_type + id.
    try {
      const payload = JSON.parse(params.raw_body) as Record<string, unknown>;
      const eventType = (payload.event_type as string) ?? 'charge.paid';
      const externalId =
        (payload.external_id as string) ??
        (payload.id as string) ??
        mockExternalId('mock_wh');

      return {
        valid: true,
        event: {
          event_type: eventType as never,
          external_id: externalId,
          occurred_at: new Date().toISOString(),
          raw_payload: payload,
        },
      };
    } catch {
      return { valid: false, error: 'Webhook body não é JSON válido.' };
    }
  },

  async testConnection(_ctx: ProviderContext): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  },
};

export default mockDriver;
