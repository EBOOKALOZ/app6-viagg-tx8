// ═══════════════════════════════════════════════════════
// PAY Module — Utility Functions
// ═══════════════════════════════════════════════════════

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PAYOUT_STATUS_COLORS,
  PAYOUT_STATUS_LABELS,
  SOURCE_TYPE_COLORS,
  SOURCE_TYPE_LABELS,
  WITHDRAWAL_MIN_CENTS,
  WITHDRAWAL_MAX_CENTS,
} from "./payConstants";
import type { PayoutStatus } from "./payTypes";

// ─── Currency Formatting ────────────────────────────
export const formatBRL = (cents: number): string =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export const formatBRLCompact = (cents: number): string => {
  const value = cents / 100;
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`;
  return formatBRL(cents);
};

// ─── Date Formatting ────────────────────────────────
export const formatDate = (dateStr: string): string => {
  try {
    return format(parseISO(dateStr), "dd/MM/yy HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export const formatDateShort = (dateStr: string): string => {
  try {
    return format(parseISO(dateStr), "dd/MM/yy", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

export const formatDateFull = (dateStr: string): string => {
  try {
    return format(parseISO(dateStr), "dd 'de' MMMM 'de' yyyy, HH:mm", {
      locale: ptBR,
    });
  } catch {
    return dateStr;
  }
};

// ─── Status Helpers ─────────────────────────────────
export const getPayoutStatusLabel = (status: string): string =>
  PAYOUT_STATUS_LABELS[status as PayoutStatus] || status;

export const getPayoutStatusColor = (status: string): string =>
  PAYOUT_STATUS_COLORS[status as PayoutStatus] || "bg-gray-100 text-gray-600";

export const getSourceTypeLabel = (sourceType: string): string =>
  SOURCE_TYPE_LABELS[sourceType] || sourceType;

export const getSourceTypeColor = (sourceType: string): string =>
  SOURCE_TYPE_COLORS[sourceType] || "bg-gray-100 text-gray-600";

// ─── Validation ─────────────────────────────────────
export const validateWithdrawalAmount = (
  amountCents: number,
  availableCents: number
): { valid: boolean; error?: string } => {
  if (amountCents <= 0)
    return { valid: false, error: "Valor deve ser maior que zero" };
  if (amountCents < WITHDRAWAL_MIN_CENTS)
    return {
      valid: false,
      error: `Valor mínimo: ${formatBRL(WITHDRAWAL_MIN_CENTS)}`,
    };
  if (amountCents > WITHDRAWAL_MAX_CENTS)
    return {
      valid: false,
      error: `Valor máximo: ${formatBRL(WITHDRAWAL_MAX_CENTS)}`,
    };
  if (amountCents > availableCents)
    return {
      valid: false,
      error: `Saldo insuficiente. Disponível: ${formatBRL(availableCents)}`,
    };
  return { valid: true };
};

// ─── ID Helpers ─────────────────────────────────────
export const truncateId = (id: string | null, chars = 8): string =>
  id ? `${id.slice(0, chars)}…` : "—";

export const generateIdempotencyKey = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
