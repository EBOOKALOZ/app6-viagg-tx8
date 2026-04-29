// ═══════════════════════════════════════════════════════
// PAY Module — Core Type Definitions
// ═══════════════════════════════════════════════════════

// ─── Payout State Machine ────────────────────────────
export type PayoutStatus =
  | "pending_approval"
  | "approved"
  | "queued"
  | "processing"
  | "paid"
  | "failed"
  | "canceled";

// ─── Treasury KPI Stats ─────────────────────────────
export interface TreasuryStats {
  grossBalanceCents: number;
  settledBalanceCents: number;
  availableForWithdrawalCents: number;
  reservedBalanceCents: number;
  pendingWithdrawalsCount: number;
  completedWithdrawalsCount: number;
  recentFailuresCount: number;
}

// ─── Cashflow Chart Data ────────────────────────────
export type CashflowPeriod = "daily" | "weekly" | "monthly";

export interface CashflowDataPoint {
  label: string;
  entriesCents: number;
  exitsCents: number;
  balanceCents: number;
}

// ─── Period Summary ─────────────────────────────────
export interface PeriodSummary {
  totalInCents: number;
  totalOutCents: number;
  netCents: number;
  avgDailyCents: number;
  transactionCount: number;
}

// ─── Withdrawal Request ─────────────────────────────
export interface WithdrawalRequest {
  id: string;
  user_id: string;
  owner_type: string;
  owner_id: string;
  amount_cents: number;
  fee_cents: number;
  net_amount_cents: number;
  status: PayoutStatus;
  destination_account_id: string | null;
  destination_bank_name: string | null;
  destination_pix_key: string | null;
  observation: string | null;
  idempotency_key: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string | null;
}

// ─── Bank Account ───────────────────────────────────
export type BankAccountType = "personal" | "business";

export interface PlatformBankAccount {
  id: string;
  user_id: string;
  owner_type: string;
  account_type: BankAccountType;
  account_label: string | null;
  bank_code: string | null;
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
  account_digit: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  holder_name: string | null;
  holder_document: string | null;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

// ─── Financial Statement Entry ──────────────────────
export interface StatementEntry {
  id: string;
  account_id: string;
  account_kind: string | null;
  entry_type: string | null;
  source_type: string | null;
  source_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  amount_cents: number;
  currency: string;
  balance_after_cents: number | null;
  description: string | null;
  profile_type: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Audit Event ────────────────────────────────────
export interface AuditWebhookEvent {
  id: string;
  source: string;
  event_type: string | null;
  processed: boolean;
  process_error: string | null;
  received_at: string;
}

export interface AuditReconciliation {
  id: string;
  reconciliation_date: string;
  bank_balance_cents: number | null;
  ledger_balance_cents: number | null;
  divergence_cents: number;
  status: string;
  created_at: string;
}

export interface AuditLongRunningPayout {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  hours_processing: number;
}

export interface AuditTransactionError {
  id: string;
  transaction_type: string;
  error_code: string | null;
  error_message: string | null;
  resolved: boolean;
  created_at: string;
}
