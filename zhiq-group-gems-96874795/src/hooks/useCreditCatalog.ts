/**
 * useCreditCatalog — Reads credit products and usage rules from official Supabase tables
 *
 * TABELA OFICIAL: public.merchant_credit_products
 *   - pacotes avulsos: product_type = 'pacote'
 *   - planos recorrentes: product_type IN ('mensal','semestral','anual')
 *
 * REGRAS: public.merchant_credit_usage_rules
 * SALDO: public.merchant_credit_balances
 * ASSINATURA: public.merchant_credit_subscriptions
 *
 * Nenhuma lógica financeira no frontend. Tudo read-only.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

// ─── Types (alinhados com merchant_credit_products) ─────────

export interface CreditProduct {
  id: string;
  slug: string;
  name: string;
  product_type: string; // 'pacote' | 'mensal' | 'semestral' | 'anual'
  credits_amount: number;
  credits_base: number;
  credits_bonus: number;
  price_brl: number;
  price_cents: number;
  rollover_enabled: boolean;
  rollover_percent: number;
  is_recommended: boolean;
  is_active: boolean;
  sort_order: number;
  description: string | null;
  badge_text: string | null;
}

export interface UsageRule {
  id: string;
  feature_code: string;
  feature_name: string;
  module_name: string;
  event_type: string;
  credits_cost: number;
  description: string | null;
}

export interface CreditBalance {
  available_credits: number;
  reserved_credits: number;
  consumed_credits: number;
}

export interface ActiveSubscription {
  id: string;
  product_id: string;
  status: string;
  started_at: string;
  next_renewal_at: string | null;
}

// ─── Hook ───────────────────────────────────

export function useCreditCatalog() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);

  // Resolve merchant store
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
        // Fallback: tentar tabela stores
        try {
          const { data } = await (supabase.from("stores") as any)
            .select("id")
            .eq("owner_id", user!.id)
            .single();
          if (data) setStoreId(data.id);
        } catch { /* no store */ }
      }
    })();
  }, [user?.id]);

  // ── Todos os produtos comerciais ──
  const {
    data: products = [],
    isLoading: loadingProducts,
  } = useQuery<CreditProduct[]>({
    queryKey: ["merchant-credit-products"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_products") as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) {
        console.warn("[useCreditCatalog] products error:", error.message);
        return [];
      }
      return (data || []).map((p: any) => ({
        id: p.id,
        slug: p.slug || "",
        name: p.name || "Produto",
        product_type: p.product_type || "pacote",
        credits_amount: p.credits_amount ?? 0,
        credits_base: p.credits_base ?? 0,
        credits_bonus: p.credits_bonus ?? 0,
        price_brl: p.price_brl ?? 0,
        price_cents: p.price_cents ?? 0,
        rollover_enabled: p.rollover_enabled ?? false,
        rollover_percent: p.rollover_percent ?? 0,
        is_recommended: p.is_recommended ?? false,
        is_active: p.is_active ?? true,
        sort_order: p.sort_order ?? 0,
        description: p.description ?? null,
        badge_text: p.badge_text ?? null,
      }));
    },
    staleTime: 60_000,
  });

  // ── Regras de uso (dynamic, not hardcoded) ──
  const {
    data: usageRules = [],
    isLoading: loadingRules,
  } = useQuery<UsageRule[]>({
    queryKey: ["merchant-credit-usage-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("*")
        .eq("is_active", true);
      if (error) {
        console.warn("[useCreditCatalog] rules error:", error.message);
        return [];
      }
      return (data || []).map((r: any) => ({
        id: r.id,
        feature_code: r.feature_code || "",
        feature_name: r.feature_name || "",
        module_name: r.module_name || "",
        event_type: r.event_type || "",
        credits_cost: Number(r.credits_cost) ?? 0,
        description: r.description ?? null,
      }));
    },
    staleTime: 120_000,
  });

  // ── Saldo (read-only) ──
  const {
    data: balance,
    isLoading: loadingBalance,
  } = useQuery<CreditBalance>({
    queryKey: ["credit-balance", storeId],
    queryFn: async () => {
      if (!storeId) return { available_credits: 0, reserved_credits: 0, consumed_credits: 0 };
      const { data } = await (supabase.from("merchant_credit_balances") as any)
        .select("available_credits, reserved_credits, consumed_credits")
        .eq("store_id", storeId)
        .single();
      return {
        available_credits: data?.available_credits ?? 0,
        reserved_credits: data?.reserved_credits ?? 0,
        consumed_credits: data?.consumed_credits ?? 0,
      };
    },
    enabled: !!storeId,
    refetchInterval: 30_000,
  });

  // ── Assinatura ativa ──
  const {
    data: activeSubscription,
    isLoading: loadingSubscription,
  } = useQuery<ActiveSubscription | null>({
    queryKey: ["active-credit-subscription", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data } = await (supabase.from("merchant_credit_subscriptions") as any)
        .select("id, product_id, status, started_at, next_renewal_at")
        .eq("store_id", storeId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const s = data[0];
        return { id: s.id, product_id: s.product_id, status: s.status, started_at: s.started_at, next_renewal_at: s.next_renewal_at };
      }
      return null;
    },
    enabled: !!storeId,
  });

  // ── Derivados ──
  const packages = products.filter(p => p.product_type === "pacote");
  const plans = products.filter(p => ["mensal", "semestral", "anual"].includes(p.product_type));

  return {
    products,
    packages,
    plans,
    usageRules,
    balance: balance ?? { available_credits: 0, reserved_credits: 0, consumed_credits: 0 },
    activeSubscription: activeSubscription ?? null,
    storeId,
    isLoading: loadingProducts || loadingRules || loadingBalance || loadingSubscription,
  };
}
