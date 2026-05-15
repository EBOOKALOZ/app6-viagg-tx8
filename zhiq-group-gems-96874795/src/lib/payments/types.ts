/**
 * Payment Module - Core Types
 *
 * Gateway-agnostic types and the PaymentProvider interface that every driver
 * (mock, mercadopago, asaas, ...) implements. The wallet/escrow code consumes
 * only this interface — switching gateway is a config change, not a code change.
 */

/* ─────────── Provider identification ─────────── */

export type GatewayProviderCode =
  | 'mock'
  | 'mercadopago'
  | 'asaas'
  | 'pagarme'
  | 'iugu'
  | 'stripe';

export type GatewayMode = 'sandbox' | 'production';

export interface GatewayDescriptor {
  id: string;
  provider_code: GatewayProviderCode;
  display_name: string;
  mode: GatewayMode;
  is_active: boolean;
  /** Public-safe metadata. Secrets are never exposed to the client. */
  config_preview: Record<string, string | boolean | number | null>;
  created_at: string;
  updated_at: string;
}

/* ─────────── Service taxonomy ─────────── */

export type PaymentServiceType =
  | 'delivery'        // Pagamento de entrega
  | 'ride'            // Corrida de passageiro
  | 'mototaxi'        // Mototáxi
  | 'freight'         // Frete
  | 'credit_purchase' // Lojista comprando pacote de créditos
  | 'subscription'    // Assinatura recorrente
  | 'auction';        // Arremate / leilão

export type PaymentMethod =
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'boleto'
  | 'wallet_internal'; // Saldo interno da plataforma

/* ─────────── Money ─────────── */

/**
 * All amounts in cents (integer). Never use float for money.
 * Currency is always BRL in this platform for now.
 */
export interface Money {
  amount_cents: number;
  currency: 'BRL';
}

/* ─────────── Idempotency ─────────── */

/**
 * Every public operation requires an idempotency_key. If the same key is
 * replayed, the same result is returned — no side-effect runs twice.
 */
export type IdempotencyKey = string;

/* ─────────── Charge (cobrança) ─────────── */

export interface ChargeParams {
  idempotency_key: IdempotencyKey;
  service_type: PaymentServiceType;
  /** Quem está pagando — lojista, passageiro, etc. */
  payer_user_id: string;
  /** Beneficiário interno (motoboy/driver). Ausente em credit_purchase. */
  professional_user_id?: string;
  amount: Money;
  method: PaymentMethod;
  /** Referência externa: ID do pedido/entrega/corrida. */
  reference_type: string;
  reference_id: string;
  /** Descrição livre para extrato. */
  description: string;
  /** Metadata livre — payload do gateway, contexto operacional, etc. */
  metadata?: Record<string, unknown>;
}

export type ChargeStatus =
  | 'pending'      // Aguardando confirmação do gateway
  | 'authorized'   // Autorizado (cartão) ainda não capturado
  | 'paid'         // Pago e confirmado
  | 'failed'       // Falhou
  | 'cancelled'    // Cancelado antes de pagar
  | 'refunded'     // Estornado
  | 'expired';     // Expirou (PIX, boleto)

export interface ChargeResult {
  charge_id: string;            // ID interno
  external_id: string | null;    // ID no gateway
  status: ChargeStatus;
  /** Para PIX: QR code base64 + copia-e-cola. Para cartão: URL do checkout. */
  payment_payload?: {
    pix_qr_base64?: string;
    pix_copy_paste?: string;
    checkout_url?: string;
    boleto_pdf_url?: string;
    boleto_barcode?: string;
  };
  /** Quando expira (PIX/boleto). */
  expires_at?: string;
  /** Mensagem de erro humanamente legível, se falhou. */
  error_message?: string;
}

/* ─────────── Payout (saque para motoboy) ─────────── */

export interface PayoutParams {
  idempotency_key: IdempotencyKey;
  recipient_user_id: string;
  amount: Money;
  pix_key: string;
  pix_key_type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  /** Validação opcional: titular esperado da chave PIX. */
  expected_holder_name?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export type PayoutStatus =
  | 'pending'    // Solicitado
  | 'approved'   // Aprovado (admin ou automático)
  | 'processing' // Enviado ao gateway
  | 'paid'       // Confirmado (PIX caiu na conta)
  | 'failed'     // Falhou
  | 'rejected';  // Rejeitado (admin ou compliance)

export interface PayoutResult {
  payout_id: string;
  external_id: string | null;
  status: PayoutStatus;
  /** End-to-end ID do PIX, se disponível. */
  end_to_end_id?: string;
  error_message?: string;
}

/* ─────────── Refund (estorno) ─────────── */

export interface RefundParams {
  idempotency_key: IdempotencyKey;
  /** ID do charge original que está sendo estornado. */
  original_charge_id: string;
  /** Estorno parcial é suportado se < amount original. */
  amount: Money;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  refund_id: string;
  external_id: string | null;
  status: 'pending' | 'processed' | 'failed';
  error_message?: string;
}

/* ─────────── Status query ─────────── */

export interface TransactionStatusResult {
  external_id: string;
  status: ChargeStatus | PayoutStatus;
  raw: Record<string, unknown>;
}

/* ─────────── Webhook ─────────── */

export interface WebhookValidationParams {
  /** Raw body do request — bytes ou string. NÃO parsed. */
  raw_body: string;
  /** Header de assinatura (ex: x-signature do Mercado Pago). */
  signature_header: string | null;
  /** Outros headers que o gateway exigir. */
  headers: Record<string, string>;
}

export interface NormalizedWebhookEvent {
  /** Tipo de evento normalizado, independente do gateway. */
  event_type:
    | 'charge.paid'
    | 'charge.failed'
    | 'charge.refunded'
    | 'charge.expired'
    | 'payout.paid'
    | 'payout.failed'
    | 'subscription.renewed'
    | 'unknown';
  /** ID no gateway que conecta com nossa charge/payout. */
  external_id: string;
  /** Timestamp do evento, em ISO. */
  occurred_at: string;
  /** Payload bruto para auditoria/replay. */
  raw_payload: Record<string, unknown>;
}

export interface WebhookValidationResult {
  valid: boolean;
  event?: NormalizedWebhookEvent;
  error?: string;
}

/* ─────────── Provider configuration ─────────── */

export interface GatewayCredentials {
  /** Identificador público (Public Key). Pode aparecer no client. */
  public_key?: string;
  /** Token secreto. NUNCA exposto no client; viaja só no backend/Edge Function. */
  access_token?: string;
  /** Webhook signing secret (HMAC). */
  webhook_secret?: string;
  /** Outras credenciais específicas do provider. */
  extras?: Record<string, string>;
}

export interface GatewayConfig {
  /** Auto-confirma cobrança após N segundos (só Mock). */
  mock_auto_confirm_seconds?: number;
  /** Força falha em transações de teste (só Mock). */
  mock_force_failure?: boolean;
  /** URL pública do webhook neste ambiente. */
  webhook_url?: string;
  /** CPF/CNPJ recebedor da plataforma. */
  payee_document?: string;
  /** Conta bancária da plataforma (referência). */
  payee_account_ref?: string;
}

/* ─────────── The PaymentProvider interface ─────────── */

/**
 * Every driver implements this. The wallet/escrow layer consumes only this.
 *
 * Drivers are stateless — they receive credentials/config per call via the
 * registry, which loads from payment_gateways table.
 */
export interface PaymentProvider {
  /** Código do provider (mock, mercadopago, ...). */
  readonly code: GatewayProviderCode;

  /** Cobrar — PIX, cartão, etc. */
  charge(
    params: ChargeParams,
    ctx: ProviderContext,
  ): Promise<ChargeResult>;

  /** Pagar motoboy via PIX out. */
  payout(
    params: PayoutParams,
    ctx: ProviderContext,
  ): Promise<PayoutResult>;

  /** Estornar — total ou parcial. */
  refund(
    params: RefundParams,
    ctx: ProviderContext,
  ): Promise<RefundResult>;

  /** Consultar status de uma transação no gateway. */
  getTransactionStatus(
    external_id: string,
    ctx: ProviderContext,
  ): Promise<TransactionStatusResult>;

  /** Validar assinatura HMAC + normalizar evento de webhook. */
  validateWebhook(
    params: WebhookValidationParams,
    ctx: ProviderContext,
  ): Promise<WebhookValidationResult>;

  /** Testar conexão — chamado pelo "Testar conexão" do admin. */
  testConnection(ctx: ProviderContext): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Context passed to every provider call. Mantém credenciais/config fora
 * do construtor para que drivers sejam stateless e testáveis.
 */
export interface ProviderContext {
  mode: GatewayMode;
  credentials: GatewayCredentials;
  config: GatewayConfig;
}
