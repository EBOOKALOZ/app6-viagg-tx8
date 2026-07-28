/**
 * useMotoboyPayViews — Consumes real motoboy financial views from Supabase
 * 
 * Views consumed:
 * - v_motoboy_pay_wallet_overview → filtered by user.id (motoboy_profile_id)
 * - v_motoboy_pay_earnings_detailed → filtered by user.id
 * - v_motoboy_pay_payouts_detailed → filtered by user.id
 * 
 * Security: user.id used directly as motoboy_profile_id (same pattern as useMotoboyPayWallet)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ==================== Types ====================

export interface MotoboyWalletOverview {
  motoboy_profile_id: string;
  total_balance: number;
  available_balance: number;
  reserved_balance: number;
  last_updated: string;
}

export interface MotoboyEarningEntry {
  id: string;
  motoboy_profile_id: string;
  created_at: string;
  source_type: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  status: string;
  reference_id: string;
}

export interface MotoboyPayoutEntry {
  id: string;
  motoboy_profile_id: string;
  status: string;
  requested_amount: number;
  fee_amount: number;
  net_amount: number;
  provider_name: string;
  requested_at: string;
  approved_at: string | null;
  processed_at: string | null;
  failure_reason: string | null;
}

// ==================== Hooks ====================

export function useMotoboyWalletOverview() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-wallet-overview", user?.id],
    queryFn: async (): Promise<MotoboyWalletOverview | null> => {
      console.log('[DEBUG useMotoboyWalletOverview] Fetching overview for user:', user?.id);
      if (!user?.id) return null;
      // @ts-expect-error - Some view or table typings may be missing
      const { data, error } = await supabase.from("v_motoboy_pay_wallet_overview")
        .select("*")
        .eq("motoboy_profile_id", user.id)
        .maybeSingle();
      
      console.log('[DEBUG useMotoboyWalletOverview] Result from v_motoboy_pay_wallet_overview:', data);
      
      if (error) { 
        console.error("v_motoboy_pay_wallet_overview error:", error); 
        return null; 
      }
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
}

export function useMotoboyEarningsDetailed(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-earnings-detailed", user?.id, limit],
    queryFn: async (): Promise<MotoboyEarningEntry[]> => {
      if (!user?.id) return [];
      // @ts-expect-error - Some view or table typings may be missing
      const { data, error } = await supabase.from("v_motoboy_pay_earnings_detailed")
        .select("*")
        .eq("motoboy_profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) { console.error("v_motoboy_pay_earnings_detailed error:", error); return []; }
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
}

export function useMotoboyPayoutsDetailed() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-payouts-detailed", user?.id],
    queryFn: async (): Promise<MotoboyPayoutEntry[]> => {
      if (!user?.id) return [];
      // @ts-expect-error - Some view or table typings may be missing
      const { data, error } = await supabase.from("v_motoboy_pay_payouts_detailed")
        .select("*")
        .eq("motoboy_profile_id", user.id)
        .order("requested_at", { ascending: false });
      if (error) { console.error("v_motoboy_pay_payouts_detailed error:", error); return []; }
      return data || [];
    },
    enabled: !!user?.id,
  });
}
