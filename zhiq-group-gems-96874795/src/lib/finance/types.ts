/**
 * Financial System Types - Prepared for future automation
 * 
 * These types are designed to support manual operations (MVP)
 * and future gateway integrations without breaking changes.
 */

// ============= Standardized Financial Statuses =============
export type FinancialStatus = 
  | 'pending'   // Awaiting action
  | 'paid'      // Payment confirmed (manual or gateway)
  | 'settled'   // Final settlement completed (future: gateway confirmed)
  | 'refunded'; // Transaction reversed

export type TransactionActor = 
  | 'admin'     // Manual admin action
  | 'system'    // Automated system action (future: gateway)
  | 'user';     // User-initiated action

// ============= Base Financial Event =============
export interface FinancialEvent {
  id: string;
  event_type: string;
  actor: TransactionActor;
  actor_id: string | null;  // User ID of the actor
  reference_type: 'delivery' | 'recharge' | 'payout' | 'refund' | 'adjustment';
  reference_id: string | null;
  amount: number;
  status: FinancialStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

// ============= Motoboy Payout Types =============
export interface MotoboyPayoutData {
  motoboy_id: string;
  motoboy_name: string;
  motoboy_email: string;
  amount: number;
  payment_method: 'pix' | 'bank_transfer';
  bank_details: {
    pix_chave?: string;
    pix_tipo_chave?: string;
    banco?: string;
    agencia?: string;
    conta?: string;
    tipo_conta?: string;
    nome_titular?: string;
    cpf_titular?: string;
  };
  period_start?: string;
  period_end?: string;
}

export interface MotoboyPayoutResult {
  success: boolean;
  transaction_id?: string;
  receipt_id?: string;
  receipt_hash?: string;
  error?: string;
}

// ============= Merchant Recharge Types =============
export interface MerchantRechargeData {
  merchant_id: string;
  store_name: string;
  store_email: string;
  amount: number;
  payment_method: string;
  observation?: string;
}

export interface MerchantRechargeResult {
  success: boolean;
  transaction_id?: string;
  receipt_id?: string;
  receipt_hash?: string;
  new_balance?: number;
  error?: string;
}

// ============= Delivery Payment Types =============
export interface DeliveryPaymentData {
  delivery_id: string;
  merchant_id: string;
  motoboy_id: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
}

export interface DeliveryPaymentResult {
  success: boolean;
  merchant_transaction_id?: string;
  motoboy_transaction_id?: string;
  error?: string;
}

// ============= Receipt Generation Types =============
export type ReceiptType = 
  | 'delivery'
  | 'motoboy_payment'
  | 'merchant_recharge';

export interface ReceiptGenerationData {
  type: ReceiptType;
  user_id: string;
  amount: number;
  payment_method?: string;
  paid_by: string;
  paid_by_name: string;
  details: Record<string, unknown>;
  period_start?: string;
  period_end?: string;
}

export interface ReceiptResult {
  id: string;
  receipt_hash: string;
  created_at: string;
}

// ============= Financial Summary Types =============
export interface FinancialSummary {
  total_received_merchants: number;
  total_paid_motoboys: number;
  total_platform_fees: number;
  net_profit: number;
  delivery_count: number;
  period_start: string;
  period_end: string;
}

// ============= Wallet Balance Types =============
export interface MotoboyWalletBalance {
  saldo_entregas: number;
  creditos_bonus: number;
  total_estornos: number;
  saldo_total: number;
}

export interface MerchantWalletBalance {
  saldo_disponivel: number;
  saldo_reservado: number;
  total_recargas: number;
  total_gastos: number;
}

// ============= Transaction Types =============
export type MotoboyTransactionType = 
  | 'entrega'   // Delivery earning
  | 'bonus'     // Bonus credit
  | 'estorno'   // Refund/adjustment
  | 'saque';    // Payout/withdrawal

export type MerchantTransactionType = 
  | 'recarga'           // Recharge/deposit
  | 'reserva'           // Reserved for pending delivery
  | 'pagamento_entrega' // Confirmed delivery payment
  | 'estorno'           // Refund
  | 'ajuste';           // Administrative adjustment

export interface WalletTransaction {
  id: string;
  user_id: string;
  tipo: string;
  valor: number;
  descricao: string | null;
  referencia_id: string | null;
  created_at: string;
}
