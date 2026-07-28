import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subHours } from "date-fns";
import type {
  AuditWebhookEvent,
  AuditReconciliation,
  AuditLongRunningPayout,
  AuditTransactionError,
} from "@/skills/pay/payTypes";
import { REFETCH_INTERVAL_MS, LONG_RUNNING_PAYOUT_HOURS } from "@/skills/pay/payConstants";

// ═══════════════════════════════════════════════════════
// Webhook Events
// ═══════════════════════════════════════════════════════
export function usePayAuditWebhooks(limit = 25) {
  return useQuery({
    queryKey: ["pay-audit-webhooks", limit],
    queryFn: async (): Promise<AuditWebhookEvent[]> => {
      const { data, error } = await (supabase.from("pay_webhook_raw") as unknown)
        .select("id, source, event_type, processed, process_error, received_at")
        .order("received_at", { ascending: false })
        .limit(limit);
      if (error) { console.error("Error fetching audit webhooks:", error); return []; }
      return data || [];
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Reconciliation Divergences
// ═══════════════════════════════════════════════════════
export function usePayAuditReconciliation() {
  return useQuery({
    queryKey: ["pay-audit-reconciliation"],
    queryFn: async (): Promise<AuditReconciliation[]> => {
      const { data, error } = await (supabase.from("pay_reconciliation_log") as unknown)
        .select("id, reconciliation_date, bank_balance_cents, ledger_balance_cents, divergence_cents, status, created_at")
        .order("reconciliation_date", { ascending: false })
        .limit(20);
      if (error) { console.error("Error fetching reconciliation:", error); return []; }
      return data || [];
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Long-Running Payouts (processing > threshold hours)
// ═══════════════════════════════════════════════════════
export function usePayAuditLongRunningPayouts() {
  return useQuery({
    queryKey: ["pay-audit-long-running"],
    queryFn: async (): Promise<AuditLongRunningPayout[]> => {
      const threshold = subHours(new Date(), LONG_RUNNING_PAYOUT_HOURS).toISOString();

      const { data, error } = await supabase
        .from("payout_requests")
        .select("id, amount_cents, status, created_at")
        .eq("status", "processing")
        .lt("created_at", threshold)
        .order("created_at", { ascending: true });

      if (error) { console.error("Error fetching long-running payouts:", error); return []; }

      return (data || []).map((p: unknown) => {
        const hoursProcessing = Math.round(
          (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60)
        );
        return {
          id: p.id,
          amount_cents: Number(p.amount_cents),
          status: p.status,
          created_at: p.created_at,
          hours_processing: hoursProcessing,
        };
      });
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Transaction Errors / Send Failures
// ═══════════════════════════════════════════════════════
export function usePayAuditErrors() {
  return useQuery({
    queryKey: ["pay-audit-errors"],
    queryFn: async (): Promise<AuditTransactionError[]> => {
      const { data, error } = await (supabase.from("pay_transaction_errors") as unknown)
        .select("id, transaction_type, error_code, error_message, resolved, created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) { console.error("Error fetching audit errors:", error); return []; }
      return data || [];
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}

// ═══════════════════════════════════════════════════════
// Audit Summary Counts (for badge numbers)
// ═══════════════════════════════════════════════════════
export function usePayAuditSummary() {
  return useQuery({
    queryKey: ["pay-audit-summary"],
    queryFn: async () => {
      const threshold = subHours(new Date(), LONG_RUNNING_PAYOUT_HOURS).toISOString();

      const [webhookRes, reconRes, longRunRes, errorRes, pendingRes] = await Promise.all([
        (supabase.from("pay_webhook_raw") as unknown)
          .select("id", { count: "exact", head: true })
          .eq("processed", false),
        (supabase.from("pay_reconciliation_log") as unknown)
          .select("id", { count: "exact", head: true })
          .eq("status", "divergent"),
        supabase
          .from("payout_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "processing")
          .lt("created_at", threshold),
        (supabase.from("pay_transaction_errors") as unknown)
          .select("id", { count: "exact", head: true })
          .eq("resolved", false),
        supabase
          .from("payout_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending_approval", "approved", "queued"]),
      ]);

      const pending = pendingRes.count || 0;
      return {
        unprocessedWebhooks: webhookRes.count || 0,
        divergences: reconRes.count || 0,
        longRunningPayouts: longRunRes.count || 0,
        unresolvedErrors: errorRes.count || 0,
        pendingWithdrawals: pending,
        totalAlerts: (webhookRes.count || 0) + (reconRes.count || 0) + (longRunRes.count || 0) + (errorRes.count || 0) + pending,
      };
    },
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
