/**
 * usePayAdminViews — Consumes the 9 real PAY admin views from Supabase
 * 
 * Views consumed:
 * - v_pay_admin_platform_summary
 * - v_pay_admin_sales_summary
 * - v_pay_admin_motoboy_summary
 * - v_pay_admin_payout_summary
 * - v_pay_admin_recent_ledger
 * - v_pay_audit_credit_purchases_pending
 * - v_pay_audit_credit_purchases_paid
 * - v_pay_audit_motoboy_payouts_pending
 * - v_pay_audit_possible_inconsistencies
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ==================== Types ====================

export interface PlatformSummary {
  account_type: string;
  balance: number;
  total_credits: number;
  total_debits: number;
  entry_count: number;
}

export interface SalesSummary {
  total_purchases: number;
  total_amount_paid: number;
  total_credits_granted: number;
  pending_count: number;
  paid_count: number;
}

export interface MotoboySummary {
  total_motoboys: number;
  total_net_earnings: number;
  total_gross_earnings: number;
  total_commission: number;
  avg_net_per_motoboy: number;
}

export interface PayoutSummary {
  total_payout_requests: number;
  total_requested_amount: number;
  total_fee_amount: number;
  total_net_amount: number;
  pending_count: number;
  pending_amount: number;
  approved_count: number;
  processed_count: number;
}

export interface RecentLedgerEntry {
  id: string;
  created_at: string;
  owner_type: string;
  owner_id: string;
  account_type: string;
  direction: string;
  entry_type: string;
  amount: number;
  reason_code: string;
  reference_type: string;
  reference_id: string;
}

export interface CreditPurchaseEntry {
  id: string;
  store_id: string;
  store_name: string;
  product_name: string;
  amount_paid: number;
  credits_granted: number;
  status: string;
  provider_name: string;
  provider_payment_id: string;
  created_at: string;
}

export interface MotoboyPayoutPending {
  id: string;
  motoboy_profile_id: string;
  whatsapp: string;
  requested_amount: number;
  fee_amount: number;
  net_amount: number;
  provider_name: string;
  requested_at: string;
}

export interface AuditInconsistency {
  id: string;
  issue_type: string;
  reference_type: string;
  reference_id: string;
  description: string;
  severity: string;
  detected_at: string;
}

// ==================== Hooks ====================

export function usePayPlatformSummary() {
  return useQuery({
    queryKey: ["pay-admin-platform-summary"],
    queryFn: async (): Promise<PlatformSummary[]> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_admin_platform_summary")
        .select("*");
      if (error) { console.error("v_pay_admin_platform_summary error:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

export function usePaySalesSummary() {
  return useQuery({
    queryKey: ["pay-admin-sales-summary"],
    queryFn: async (): Promise<SalesSummary | null> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_admin_sales_summary")
        .select("*")
        .maybeSingle();
      if (error) { console.error("v_pay_admin_sales_summary error:", error); return null; }
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function usePayMotoboySummary() {
  return useQuery({
    queryKey: ["pay-admin-motoboy-summary"],
    queryFn: async (): Promise<MotoboySummary | null> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_admin_motoboy_summary")
        .select("*")
        .maybeSingle();
      if (error) { console.error("v_pay_admin_motoboy_summary error:", error); return null; }
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function usePayPayoutSummary() {
  return useQuery({
    queryKey: ["pay-admin-payout-summary"],
    queryFn: async (): Promise<PayoutSummary | null> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_admin_payout_summary")
        .select("*")
        .maybeSingle();
      if (error) { console.error("v_pay_admin_payout_summary error:", error); return null; }
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function usePayRecentLedger(limit = 50) {
  return useQuery({
    queryKey: ["pay-admin-recent-ledger", limit],
    queryFn: async (): Promise<RecentLedgerEntry[]> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_admin_recent_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) { console.error("v_pay_admin_recent_ledger error:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

export function usePayCreditPurchasesPending() {
  return useQuery({
    queryKey: ["pay-audit-credit-purchases-pending"],
    queryFn: async (): Promise<CreditPurchaseEntry[]> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_audit_credit_purchases_pending")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { console.error("v_pay_audit_credit_purchases_pending error:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

export function usePayCreditPurchasesPaid() {
  return useQuery({
    queryKey: ["pay-audit-credit-purchases-paid"],
    queryFn: async (): Promise<CreditPurchaseEntry[]> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_audit_credit_purchases_paid")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { console.error("v_pay_audit_credit_purchases_paid error:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

export function usePayMotoboyPayoutsPending() {
  return useQuery({
    queryKey: ["pay-audit-motoboy-payouts-pending"],
    queryFn: async (): Promise<MotoboyPayoutPending[]> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_audit_motoboy_payouts_pending")
        .select("*")
        .order("requested_at", { ascending: false });
      if (error) { console.error("v_pay_audit_motoboy_payouts_pending error:", error); return []; }
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

export function usePayAuditInconsistencies() {
  return useQuery({
    queryKey: ["pay-audit-inconsistencies"],
    queryFn: async (): Promise<AuditInconsistency[]> => {
      // @ts-expect-error - Type definitions may be missing
      const { data, error } = await supabase.from("v_pay_audit_possible_inconsistencies")
        .select("*")
        .order("detected_at", { ascending: false });
      if (error) { console.error("v_pay_audit_possible_inconsistencies error:", error); return []; }
      return data || [];
    },
    refetchInterval: 60_000,
  });
}
