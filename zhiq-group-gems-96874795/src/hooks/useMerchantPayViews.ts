/**
 * useMerchantPayViews — Consumes real merchant financial views from Supabase
 * 
 * Views consumed:
 * - v_merchant_credit_wallet_overview → filtered by store_id
 * - v_merchant_credit_purchase_history → filtered by store_id
 * - v_merchant_credit_ledger_detailed → filtered by store_id
 * 
 * Security: store_id resolved via user.id → merchant_stores.user_id
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

// ==================== Types ====================

export interface MerchantWalletOverview {
  store_id: string;
  available_credits: number;
  reserved_credits: number;
  consumed_credits: number;
  total_purchased: number;
  last_updated: string;
}

export interface MerchantCreditPurchase {
  id: string;
  store_id: string;
  product_name: string;
  amount_paid: number;
  credits_granted: number;
  status: string;
  provider_name: string;
  provider_payment_id: string;
  created_at: string;
}

export interface MerchantCreditLedgerEntry {
  id: string;
  store_id: string;
  created_at: string;
  entry_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reason_code: string;
  description: string;
}

// ==================== Store ID resolver ====================

function useStoreId() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        // @ts-expect-error - Some schemas might not be fully typed yet
        const { data } = await supabase.from("merchant_stores")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (data) setStoreId(data.id);
      } catch { /* no store */ }
    })();
  }, [user?.id]);

  return storeId;
}

// ==================== Hooks ====================

export function useMerchantWalletOverview() {
  const storeId = useStoreId();

  const query = useQuery({
    queryKey: ["merchant-wallet-overview", storeId],
    queryFn: async (): Promise<MerchantWalletOverview | null> => {
      if (!storeId) return null;
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data, error } = await supabase.from("v_merchant_credit_wallet_overview")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) { console.error("v_merchant_credit_wallet_overview error:", error); return null; }
      return data;
    },
    enabled: !!storeId,
    refetchInterval: 30_000,
  });

  return { ...query, storeId };
}

export function useMerchantCreditPurchaseHistory() {
  const storeId = useStoreId();

  return useQuery({
    queryKey: ["merchant-credit-purchase-history", storeId],
    queryFn: async (): Promise<MerchantCreditPurchase[]> => {
      if (!storeId) return [];
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data, error } = await supabase.from("v_merchant_credit_purchase_history")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) { console.error("v_merchant_credit_purchase_history error:", error); return []; }
      return data || [];
    },
    enabled: !!storeId,
    refetchInterval: 30_000,
  });
}

export function useMerchantCreditLedgerDetailed() {
  const storeId = useStoreId();

  return useQuery({
    queryKey: ["merchant-credit-ledger-detailed", storeId],
    queryFn: async (): Promise<MerchantCreditLedgerEntry[]> => {
      if (!storeId) return [];
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data, error } = await supabase.from("v_merchant_credit_ledger_detailed")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) { console.error("v_merchant_credit_ledger_detailed error:", error); return []; }
      return data || [];
    },
    enabled: !!storeId,
    refetchInterval: 30_000,
  });
}
