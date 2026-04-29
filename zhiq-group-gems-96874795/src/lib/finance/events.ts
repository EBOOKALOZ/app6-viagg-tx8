/**
 * Financial Event System - Event-based architecture for future automation
 * 
 * This module provides a centralized event emission system for financial actions.
 * In MVP, events trigger receipt generation and logging.
 * Future: Events will trigger gateway calls, webhooks, etc.
 */

import type {
  FinancialEvent,
  TransactionActor,
  FinancialStatus,
  ReceiptType,
} from './types';

// ============= Event Emitter (Simple implementation for MVP) =============
type EventHandler = (event: FinancialEvent) => void | Promise<void>;

const eventHandlers: Map<string, EventHandler[]> = new Map();

export function onFinancialEvent(eventType: string, handler: EventHandler): () => void {
  const handlers = eventHandlers.get(eventType) || [];
  handlers.push(handler);
  eventHandlers.set(eventType, handlers);

  // Return unsubscribe function
  return () => {
    const currentHandlers = eventHandlers.get(eventType) || [];
    const index = currentHandlers.indexOf(handler);
    if (index > -1) {
      currentHandlers.splice(index, 1);
      eventHandlers.set(eventType, currentHandlers);
    }
  };
}

export async function emitFinancialEvent(event: FinancialEvent): Promise<void> {
  console.log('[FinancialEvent]', event.event_type, {
    id: event.id,
    amount: event.amount,
    actor: event.actor,
    reference_type: event.reference_type,
    reference_id: event.reference_id,
    status: event.status,
  });

  const handlers = eventHandlers.get(event.event_type) || [];
  const allHandlers = [...handlers, ...(eventHandlers.get('*') || [])];

  for (const handler of allHandlers) {
    try {
      await handler(event);
    } catch (error) {
      console.error('[FinancialEvent] Handler error:', error);
    }
  }
}

// ============= Event Factory Functions =============
export function createFinancialEvent(params: {
  event_type: string;
  actor: TransactionActor;
  actor_id: string | null;
  reference_type: FinancialEvent['reference_type'];
  reference_id: string | null;
  amount: number;
  status: FinancialStatus;
  metadata?: Record<string, unknown>;
}): FinancialEvent {
  return {
    id: crypto.randomUUID(),
    event_type: params.event_type,
    actor: params.actor,
    actor_id: params.actor_id,
    reference_type: params.reference_type,
    reference_id: params.reference_id,
    amount: params.amount,
    status: params.status,
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
    processed_at: null,
  };
}

// ============= Predefined Event Types =============
export const FINANCIAL_EVENTS = {
  // Motoboy Events
  MOTOBOY_PAYOUT_INITIATED: 'motoboy.payout.initiated',
  MOTOBOY_PAYOUT_COMPLETED: 'motoboy.payout.completed',
  MOTOBOY_PAYOUT_FAILED: 'motoboy.payout.failed',
  MOTOBOY_EARNING_CREDITED: 'motoboy.earning.credited',
  
  // Merchant Events
  MERCHANT_RECHARGE_INITIATED: 'merchant.recharge.initiated',
  MERCHANT_RECHARGE_COMPLETED: 'merchant.recharge.completed',
  MERCHANT_PAYMENT_RESERVED: 'merchant.payment.reserved',
  MERCHANT_PAYMENT_CONFIRMED: 'merchant.payment.confirmed',
  MERCHANT_PAYMENT_CANCELLED: 'merchant.payment.cancelled',
  
  // Delivery Events
  DELIVERY_PAYMENT_PROCESSED: 'delivery.payment.processed',
  DELIVERY_REFUND_PROCESSED: 'delivery.refund.processed',
  
  // Receipt Events
  RECEIPT_GENERATED: 'receipt.generated',
} as const;

// ============= Receipt Event Helper =============
export function createReceiptEvent(params: {
  receipt_type: ReceiptType;
  receipt_id: string;
  receipt_hash: string;
  user_id: string;
  amount: number;
  actor_id: string;
}): FinancialEvent {
  return createFinancialEvent({
    event_type: FINANCIAL_EVENTS.RECEIPT_GENERATED,
    actor: 'admin',
    actor_id: params.actor_id,
    reference_type: params.receipt_type === 'delivery' ? 'delivery' : 
                    params.receipt_type === 'motoboy_payment' ? 'payout' : 'recharge',
    reference_id: params.receipt_id,
    amount: params.amount,
    status: 'paid',
    metadata: {
      receipt_type: params.receipt_type,
      receipt_hash: params.receipt_hash,
      user_id: params.user_id,
    },
  });
}
