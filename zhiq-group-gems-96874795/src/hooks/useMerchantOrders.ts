/**
 * useMerchantOrders — Hook for merchant purchase intentions
 *
 * Fetches purchase intentions, details, credits, and provides
 * realtime subscription for live updates.
 *
 * Resilient to both field naming conventions:
 *   - subtotal / subtotal_amount
 *   - credits_charged / credits_debited
 *   - available_balance / available_credits
 */
import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────
export interface PurchaseIntention {
  id: string;
  store_id: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string | null;
  customer_note: string | null;
  customer_bairro: string;
  customer_city: string;
  subtotal: number;
  total_items: number;
  status: "new" | "viewed" | "converted" | "cancelled";
  source: string;
  checkout_mode: "online_payment" | "in_store";
  payment_status: string | null;
  credits_charged: number;
  created_at: string;
  updated_at: string;
  first_product_image: string | null;
  first_product_title: string | null;
  first_product_price: number;
}

export interface IntentionItem {
  id: string;
  intention_id: string;
  product_id: string;
  product_title: string;
  product_image_url: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  customer_note: string | null;
}

export interface IntentionCredit {
  credits_charged: number;
  balance_after: number;
  reason: string;
  rule_applied: string;
  available_balance: number;
}

export interface IntentionDetail {
  id: string;
  store_id: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_email: string | null;
  customer_note: string | null;
  subtotal: number;
  total_items: number;
  status: string;
  source: string;
  checkout_mode: "online_payment" | "in_store";
  payment_status: string | null;
  credits_charged: number;
  created_at: string;
  items: IntentionItem[];
  credit_info: IntentionCredit;
}

export interface OrderKPIs {
  newCount: number;
  viewedCount: number;
  convertedCount: number;
  cancelledCount: number;
  totalCreditsSpent: number;
}

// ─── Field resolver (handles both naming conventions) ──
function resolveNum(row: any, ...keys: string[]): number {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return Number(row[k]) || 0;
  }
  return 0;
}

function resolveStr(row: any, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return String(row[k]);
  }
  return "";
}

// ─── Hook ──────────────────────────────
export function useMerchantOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<string | null>(null);

  // ── Get merchant store ID ──
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await (supabase.from("merchant_stores") as any)
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (data) setStoreId(data.id);
      } catch {
        // no store
      }
    })();
  }, [user?.id]);

  // ── Fetch intentions ──
  const {
    data: intentions = [],
    isLoading: loadingIntentions,
    refetch: refetchIntentions,
  } = useQuery<PurchaseIntention[]>({
    queryKey: ["merchant-intentions", storeId],
    queryFn: async () => {
      if (!storeId) return [];
      // Read directly from table (no view dependency)
      const { data, error } = await (supabase.from("purchase_intentions") as any)
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[useMerchantOrders] fetch error:", error);
        throw error;
      }
      if (!data || data.length === 0) return [];

      // Fetch first product image/title for each intention
      const intentionIds = data.map((r: any) => r.id);
      const { data: itemsData } = await (supabase.from("purchase_intention_items") as any)
        .select("intention_id, product_title, product_image_url, unit_price")
        .in("intention_id", intentionIds);
      
      const firstItemMap = new Map<string, { title: string; image: string | null; price: number }>();
      (itemsData || []).forEach((item: any) => {
        if (!firstItemMap.has(item.intention_id)) {
          firstItemMap.set(item.intention_id, {
            title: item.product_title || "Produto",
            image: item.product_image_url || null,
            price: Number(item.unit_price) || 0,
          });
        }
      });

      return (data || []).map((row: any) => {
        const firstItem = firstItemMap.get(row.id);
        return {
          id: row.id,
          store_id: row.store_id,
          customer_name: row.customer_name || "Cliente",
          customer_whatsapp: row.customer_whatsapp || "",
          customer_email: row.customer_email || null,
          customer_note: row.customer_note || null,
          customer_bairro: row.customer_bairro || "",
          customer_city: row.customer_city || "",
          subtotal: resolveNum(row, "subtotal", "subtotal_amount"),
          total_items: resolveNum(row, "total_items"),
          status: row.status || "new",
          source: row.source || "store_page",
          checkout_mode: row.checkout_mode || "in_store",
          payment_status: row.payment_status || null,
          credits_charged: resolveNum(row, "credits_charged", "credits_debited"),
          created_at: row.created_at,
          updated_at: row.updated_at,
          first_product_image: firstItem?.image || null,
          first_product_title: firstItem?.title || null,
          first_product_price: firstItem?.price || 0,
        };
      });
    },
    enabled: !!storeId,
    refetchInterval: 30_000,
  });

  // ── Fetch intention detail ──
  const fetchDetail = useCallback(async (intentionId: string): Promise<IntentionDetail | null> => {
    try {
      // Fetch intention directly
      const { data, error } = await (supabase.from("purchase_intentions") as any)
        .select("*")
        .eq("id", intentionId)
        .single();
      if (error) {
        console.error("[useMerchantOrders] fetchDetail error:", error);
        throw error;
      }
      if (!data) return null;

      // Fetch items directly
      const { data: itemsData } = await (supabase.from("purchase_intention_items") as any)
        .select("*")
        .eq("intention_id", intentionId)
        .order("created_at", { ascending: true });

      return {
        id: data.id,
        store_id: data.store_id,
        customer_name: data.customer_name || "Cliente",
        customer_whatsapp: data.customer_whatsapp || "",
        customer_email: data.customer_email || null,
        customer_note: data.customer_note || null,
        subtotal: resolveNum(data, "subtotal", "subtotal_amount"),
        total_items: resolveNum(data, "total_items"),
        status: data.status || "new",
        source: data.source || "store_page",
        checkout_mode: data.checkout_mode || "in_store",
        payment_status: data.payment_status || null,
        credits_charged: resolveNum(data, "credits_charged", "credits_debited"),
        created_at: data.created_at,
        items: (itemsData || []).map((i: any) => ({
          id: i.id,
          intention_id: i.intention_id || intentionId,
          product_id: i.product_id,
          product_title: i.product_title || "Produto",
          product_image_url: i.product_image_url || null,
          unit_price: Number(i.unit_price) || 0,
          quantity: Number(i.quantity) || 1,
          subtotal: Number(i.subtotal) || 0,
          customer_note: i.customer_note || null,
        })),
        credit_info: {
          credits_charged: 0,
          balance_after: 0,
          reason: "",
          rule_applied: "",
          available_balance: 0,
        },
      };
    } catch (err) {
      console.error("[useMerchantOrders] fetchDetail error:", err);
      return null;
    }
  }, []);

  // ── Mark as viewed ──
  const markAsViewed = useCallback(async (intentionId: string) => {
    try {
      await (supabase.from("purchase_intentions") as any)
        .update({ status: "viewed", updated_at: new Date().toISOString() })
        .eq("id", intentionId)
        .eq("status", "new");
      queryClient.invalidateQueries({ queryKey: ["merchant-intentions"] });
    } catch { /* ignore */ }
  }, [queryClient]);

  // ── Update status ──
  const updateStatus = useCallback(async (intentionId: string, status: string) => {
    try {
      await (supabase.from("purchase_intentions") as any)
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", intentionId);
      queryClient.invalidateQueries({ queryKey: ["merchant-intentions"] });
    } catch { /* ignore */ }
  }, [queryClient]);

  // ── Compute KPIs ──
  const kpis: OrderKPIs = {
    newCount: intentions.filter(i => i.status === "new").length,
    viewedCount: intentions.filter(i => i.status === "viewed").length,
    convertedCount: intentions.filter(i => i.status === "converted").length,
    cancelledCount: intentions.filter(i => i.status === "cancelled").length,
    totalCreditsSpent: intentions.reduce((sum, i) => sum + i.credits_charged, 0),
  };

  // ── Realtime ──
  useEffect(() => {
    if (!storeId) return;

    const channel = supabase
      .channel(`merchant-orders-${storeId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "purchase_intentions",
        filter: `store_id=eq.${storeId}`,
      }, () => {
        refetchIntentions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, refetchIntentions]);

  return {
    storeId,
    intentions,
    kpis,
    loadingIntentions,
    fetchDetail,
    markAsViewed,
    updateStatus,
    refetchIntentions,
  };
}
