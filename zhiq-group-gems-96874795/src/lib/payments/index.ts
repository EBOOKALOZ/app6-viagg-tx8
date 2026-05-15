/**
 * Payments Module — entrypoint
 *
 * Camada de gateway de pagamento, separada da camada de eventos financeiros
 * em `@/lib/finance`. A `finance` lida com receipts, audit log, manual ops.
 * A `payments` lida com a abstração de gateways pluggable e o ledger universal.
 *
 * Hierarquia:
 *   Carteira (UI)
 *     ↓ chama
 *   Hook usePayments / useGatewayDriver
 *     ↓ usa
 *   Registry → driver concreto (mock/mercadopago/...)
 *     ↓ registra
 *   Ledger append-only (verdade financeira)
 */

export * from './types';
export * from './ledger';
export * from './idempotency';
export * from './registry';
