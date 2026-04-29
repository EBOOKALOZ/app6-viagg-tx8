// ═══════════════════════════════════════════════════════
// PAY Module — Constants & Visual Tokens
// ═══════════════════════════════════════════════════════

import type { PayoutStatus } from "./payTypes";

// ─── Payout Status Labels (pt-BR) ──────────────────
export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending_approval: "Aguardando Aprovação",
  approved: "Aprovado",
  queued: "Na Fila",
  processing: "Processando",
  paid: "Pago",
  failed: "Falhou",
  canceled: "Cancelado",
};

// ─── Payout Status Colors ──────────────────────────
export const PAYOUT_STATUS_COLORS: Record<PayoutStatus, string> = {
  pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  queued: "bg-indigo-100 text-indigo-700 border-indigo-200",
  processing: "bg-violet-100 text-violet-700 border-violet-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  canceled: "bg-gray-100 text-gray-500 border-gray-200",
};

// ─── Ledger Source Type Labels ─────────────────────
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  platform_fee: "Taxa da Plataforma",
  delivery_payment: "Pagamento de Entrega",
  ride_payment: "Pagamento de Corrida",
  payout: "Saque",
  payout_reversal: "Estorno de Saque",
  escrow_hold: "Retenção Escrow",
  escrow_release: "Liberação Escrow",
  adjustment: "Ajuste Manual",
  credit_purchase: "Compra de Créditos",
  refund: "Reembolso",
  commission: "Comissão",
  split: "Split de Pagamento",
};

// ─── Source Type Badge Colors ──────────────────────
export const SOURCE_TYPE_COLORS: Record<string, string> = {
  platform_fee: "bg-violet-100 text-violet-700",
  delivery_payment: "bg-blue-100 text-blue-700",
  ride_payment: "bg-cyan-100 text-cyan-700",
  payout: "bg-orange-100 text-orange-700",
  payout_reversal: "bg-rose-100 text-rose-700",
  escrow_hold: "bg-amber-100 text-amber-700",
  escrow_release: "bg-teal-100 text-teal-700",
  adjustment: "bg-gray-100 text-gray-600",
  credit_purchase: "bg-indigo-100 text-indigo-700",
  refund: "bg-pink-100 text-pink-700",
  commission: "bg-emerald-100 text-emerald-700",
  split: "bg-sky-100 text-sky-700",
};

// ─── KPI Card Gradient Colors ──────────────────────
export const KPI_COLORS = {
  gross: "bg-gradient-to-br from-slate-800 to-slate-700",
  settled: "bg-gradient-to-br from-emerald-700 to-emerald-600",
  available: "bg-gradient-to-br from-blue-700 to-blue-600",
  reserved: "bg-gradient-to-br from-amber-700 to-amber-600",
  pending: "bg-gradient-to-br from-orange-700 to-orange-600",
  completed: "bg-gradient-to-br from-teal-700 to-teal-600",
  failures: "bg-gradient-to-br from-red-700 to-red-600",
} as const;

// ─── Withdrawal Limits ─────────────────────────────
export const WITHDRAWAL_MIN_CENTS = 5000; // R$ 50,00
export const WITHDRAWAL_MAX_CENTS = 5000000; // R$ 50.000,00
export const WITHDRAWAL_FEE_PERCENT = 0; // 0% (configurable)

// ─── Time Thresholds ───────────────────────────────
export const LONG_RUNNING_PAYOUT_HOURS = 24;

// ─── Refetch Intervals ─────────────────────────────
export const REFETCH_INTERVAL_MS = 30_000;
export const REFETCH_INTERVAL_SLOW_MS = 60_000;
