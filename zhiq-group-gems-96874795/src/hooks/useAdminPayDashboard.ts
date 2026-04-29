import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============= Types =============
export interface PayDashboardStats {
  platformBalanceCents: number;
  todayReceivedCents: number;
  totalEscrowHeldCents: number;
  totalReleasedCents: number;
  totalCommissionCents: number;
  pendingPayoutsCount: number;
  pendingPayoutsAmountCents: number;
  divergenceCount: number;
  errorCount: number;
}

export interface PayWebhookEntry {
  id: string;
  source: string;
  event_type: string | null;
  processed: boolean;
  process_error: string | null;
  received_at: string;
}

export interface PayTransactionError {
  id: string;
  transaction_type: string;
  error_code: string | null;
  error_message: string | null;
  resolved: boolean;
  created_at: string;
}

export interface PayoutRequestEntry {
  id: string;
  owner_type: string;
  owner_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

export interface PayEscrowEntry {
  id: string;
  service_type: string;
  amount_cents: number;
  platform_fee_cents: number;
  professional_amount_cents: number;
  status: string;
  held_at: string;
  released_at: string | null;
}

export interface PayCreditPurchase {
  id: string;
  amount_cents: number;
  service_type: string;
  status: string;
  created_at: string;
  metadata: any;
}

export interface PayReconEntry {
  id: string;
  reconciliation_date: string;
  bank_balance_cents: number | null;
  ledger_balance_cents: number | null;
  divergence_cents: number;
  status: string;
  created_at: string;
}

// ============= Dashboard Stats =============
export function usePayDashboardStats(periodDays = 30) {
  return useQuery({
    queryKey: ["pay-dashboard-stats", periodDays],
    queryFn: async (): Promise<PayDashboardStats> => {
      const periodStart = subDays(new Date(), periodDays).toISOString();
      const periodEnd = new Date().toISOString();

      // Try RPC first
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        "pay_admin_dashboard_stats",
        { p_period_start: periodStart, p_period_end: periodEnd }
      );

      if (!rpcError && rpcData) {
        return {
          platformBalanceCents: rpcData.platform_balance_cents ?? 0,
          todayReceivedCents: rpcData.today_received_cents ?? 0,
          totalEscrowHeldCents: rpcData.total_escrow_held_cents ?? 0,
          totalReleasedCents: rpcData.total_released_cents ?? 0,
          totalCommissionCents: rpcData.total_commission_cents ?? 0,
          pendingPayoutsCount: rpcData.pending_payouts_count ?? 0,
          pendingPayoutsAmountCents: rpcData.pending_payouts_amount_cents ?? 0,
          divergenceCount: rpcData.divergence_count ?? 0,
          errorCount: rpcData.error_count ?? 0,
        };
      }

      // Fallback: compute from tables directly
      const todayStart = startOfDay(new Date()).toISOString();

      // Platform balance from ledger
      const { data: platformLedger } = await supabase
        .from("ledger_entries")
        .select("amount_cents")
        .eq("source_type", "platform_fee");

      const platformBalance = platformLedger?.reduce((s, e) => s + Number(e.amount_cents || 0), 0) || 0;

      // Today received
      const { data: todayLedger } = await supabase
        .from("ledger_entries")
        .select("amount_cents")
        .gte("created_at", todayStart);

      const todayReceived = todayLedger
        ?.filter(e => Number(e.amount_cents) > 0)
        .reduce((s, e) => s + Number(e.amount_cents || 0), 0) || 0;

      // Escrow held
      const { data: escrowHeld } = await (supabase.from("pay_escrow_holds") as any)
        .select("amount_cents")
        .eq("status", "held");
      const totalEscrow = escrowHeld?.reduce((s: number, e: any) => s + Number(e.amount_cents || 0), 0) || 0;

      // Splits completed
      const { data: splits } = await (supabase.from("pay_splits") as any)
        .select("professional_amount_cents, platform_fee_cents")
        .eq("status", "completed")
        .gte("created_at", periodStart);

      const totalReleased = splits?.reduce((s: number, e: any) => s + Number(e.professional_amount_cents || 0), 0) || 0;
      const totalCommission = splits?.reduce((s: number, e: any) => s + Number(e.platform_fee_cents || 0), 0) || 0;

      // Pending payouts
      const { data: pendingPayouts } = await supabase
        .from("payout_requests")
        .select("amount_cents")
        .eq("status", "pending");

      const pendingCount = pendingPayouts?.length || 0;
      const pendingAmount = pendingPayouts?.reduce((s, e) => s + Number(e.amount_cents || 0), 0) || 0;

      // Divergences
      const { count: divCount } = await (supabase.from("pay_reconciliation_log") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "divergent");

      // Errors
      const { count: errCount } = await (supabase.from("pay_transaction_errors") as any)
        .select("id", { count: "exact", head: true })
        .eq("resolved", false);

      return {
        platformBalanceCents: platformBalance,
        todayReceivedCents: todayReceived,
        totalEscrowHeldCents: totalEscrow,
        totalReleasedCents: totalReleased,
        totalCommissionCents: totalCommission,
        pendingPayoutsCount: pendingCount,
        pendingPayoutsAmountCents: pendingAmount,
        divergenceCount: divCount || 0,
        errorCount: errCount || 0,
      };
    },
    refetchInterval: 30_000,
  });
}

// ============= Recent Webhooks =============
export function usePayWebhooks(limit = 20) {
  return useQuery({
    queryKey: ["pay-webhooks", limit],
    queryFn: async (): Promise<PayWebhookEntry[]> => {
      const { data, error } = await (supabase.from("pay_webhook_raw") as any)
        .select("id, source, event_type, processed, process_error, received_at")
        .order("received_at", { ascending: false })
        .limit(limit);
      if (error) { console.error("Error fetching webhooks:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

// ============= Transaction Errors =============
export function usePayTransactionErrors() {
  return useQuery({
    queryKey: ["pay-transaction-errors"],
    queryFn: async (): Promise<PayTransactionError[]> => {
      const { data, error } = await (supabase.from("pay_transaction_errors") as any)
        .select("id, transaction_type, error_code, error_message, resolved, created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) { console.error("Error fetching tx errors:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

// ============= Payout Requests (Admin view) =============
export function usePayAdminPayouts() {
  return useQuery({
    queryKey: ["pay-admin-payouts"],
    queryFn: async (): Promise<PayoutRequestEntry[]> => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("id, owner_type, owner_id, amount_cents, status, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) { console.error("Error fetching payouts:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

// ============= Escrow Holds =============
export function usePayEscrowHolds() {
  return useQuery({
    queryKey: ["pay-escrow-holds"],
    queryFn: async (): Promise<PayEscrowEntry[]> => {
      const { data, error } = await (supabase.from("pay_escrow_holds") as any)
        .select("id, service_type, amount_cents, platform_fee_cents, professional_amount_cents, status, held_at, released_at")
        .order("held_at", { ascending: false })
        .limit(30);
      if (error) { console.error("Error fetching escrow:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

// ============= Credit Purchases =============
export function usePayCreditPurchases() {
  return useQuery({
    queryKey: ["pay-credit-purchases"],
    queryFn: async (): Promise<PayCreditPurchase[]> => {
      const { data, error } = await (supabase.from("pay_escrow_holds") as any)
        .select("id, amount_cents, service_type, status, created_at, metadata")
        .eq("service_type", "credit_purchase")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) { console.error("Error fetching credit purchases:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

// ============= Reconciliation Log =============
export function usePayReconciliation() {
  return useQuery({
    queryKey: ["pay-reconciliation"],
    queryFn: async (): Promise<PayReconEntry[]> => {
      const { data, error } = await (supabase.from("pay_reconciliation_log") as any)
        .select("id, reconciliation_date, bank_balance_cents, ledger_balance_cents, divergence_cents, status, created_at")
        .order("reconciliation_date", { ascending: false })
        .limit(15);
      if (error) { console.error("Error fetching reconciliation:", error); return []; }
      return data || [];
    },
  });
}
