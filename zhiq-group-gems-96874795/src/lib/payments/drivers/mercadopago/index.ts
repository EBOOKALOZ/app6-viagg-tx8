/**
 * Mercado Pago Driver — SKELETON
 *
 * Fase 1: arquivos criados, interface implementada com stubs que retornam
 *         "Não implementado". UI já pode configurar credenciais no admin.
 * Fase 2: implementação real (charge PIX/Cartão, payout PIX, webhook HMAC).
 *
 * Quando implementar:
 *  - charge PIX:       POST https://api.mercadopago.com/v1/payments  (transaction_type=pix)
 *  - charge Cartão:    Checkout transparente com card_token
 *  - payout PIX:       POST https://api.mercadopago.com/money_transfer  (depende de habilitação na conta)
 *  - webhook:          validar header x-signature (HMAC SHA256 com secret)
 *
 * Credenciais necessárias (em ctx.credentials):
 *  - access_token       (TEST-... ou APP_USR-...)
 *  - public_key         (TEST-... para client-side tokenization)
 *  - webhook_secret     (configurado no painel do MP)
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
} from '../../types';

const NOT_IMPLEMENTED = 'Mercado Pago driver será implementado na Fase 2.';

export const mercadopagoDriver: PaymentProvider = {
  code: 'mercadopago',

  async charge(_params: ChargeParams, _ctx: ProviderContext): Promise<ChargeResult> {
    return {
      charge_id: '',
      external_id: null,
      status: 'failed',
      error_message: NOT_IMPLEMENTED,
    };
  },

  async payout(_params: PayoutParams, _ctx: ProviderContext): Promise<PayoutResult> {
    return {
      payout_id: '',
      external_id: null,
      status: 'failed',
      error_message: NOT_IMPLEMENTED,
    };
  },

  async refund(_params: RefundParams, _ctx: ProviderContext): Promise<RefundResult> {
    return {
      refund_id: '',
      external_id: null,
      status: 'failed',
      error_message: NOT_IMPLEMENTED,
    };
  },

  async getTransactionStatus(
    external_id: string,
    _ctx: ProviderContext,
  ): Promise<TransactionStatusResult> {
    return {
      external_id,
      status: 'pending',
      raw: { _stub: true, message: NOT_IMPLEMENTED },
    };
  },

  async validateWebhook(
    _params: WebhookValidationParams,
    _ctx: ProviderContext,
  ): Promise<WebhookValidationResult> {
    return { valid: false, error: NOT_IMPLEMENTED };
  },

  async testConnection(ctx: ProviderContext): Promise<{ ok: boolean; error?: string }> {
    // Validação básica: tem access_token configurado?
    if (!ctx.credentials.access_token) {
      return { ok: false, error: 'access_token não configurado.' };
    }
    // Na Fase 2: chamar GET /users/me com o access_token para validar.
    return {
      ok: true,
      error: 'Skeleton: validação completa será feita na Fase 2.',
    };
  },
};

export default mercadopagoDriver;
