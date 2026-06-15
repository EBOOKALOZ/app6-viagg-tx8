/**
 * useMerchantPayWallet — Connects merchant credits system to PAY module
 *
 * Combines data from:
 * - merchant_credit_balances (credit balance)
 * - merchant_credit_ledger (credit history)
 * - pay_escrow_holds (credit purchases via PAY)
 * - ledger_entries (financial movements)
 *
 * Provides:
 * - Current credit balance
 * - Purchase history with values paid (in BRL)
 * - Credit consumption per module
 * - Debit justifications
 * - Remaining balance + recharge suggestion
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

// ============= Types =============
export interface MerchantPayCreditPurchase {
  id: string;
  created_at: string;
  amount_cents: number;
  credits_added: number;
  product_name: string;
  reason_code: string;
  status: string;
}

export interface MerchantPayModuleConsumption {
  module: string;
  credits_consumed: number;
  event_count: number;
  label: string;
}

export interface MerchantPayDebitEntry {
  id: string;
  created_at: string;
  amount: number;
  reason_code: string;
  description: string;
  balance_after: number;
  purchase_intention_id: string | null;
}

export interface MerchantPayRechargeAdvice {
  avgDailyConsumption: number;
  daysRemaining: number;
  suggestedPackage: string;
  urgency: "low" | "medium" | "high" | "critical";
}

// ============= Module labels =============
const MODULE_LABELS: Record<string, string> = {
  purchase_intention_received: "Cesta de Compras",
  m1_buy_click: "M1 — Clique em Comprar",
  m1_product_click: "M1 — Visualização",
  bid_received: "Leilão — Lance",
  arremate_confirmed: "Arremate",
  subscription_activation: "Assinatura",
  package_purchase: "Compra de Pacote",
  subscription_renewal: "Renovação",
  rollover_credit: "Rollover",
  manual_credit: "Crédito Manual",
  manual_debit: "Débito Manual",
};

// ============= Main Hook =============
export function useMerchantPayWallet() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);

  // Get store ID
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await (supabase.from("merchant_stores") as any)
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (data) setStoreId(data.id);
      } catch { /* no store */ }
    })();
  }, [user?.id]);

  // Credit purchases with BRL value
  const { data: purchases, isLoading: isLoadingPurchases } = useQuery({
    queryKey: ["merchant-pay-purchases", storeId],
    queryFn: async (): Promise<MerchantPayCreditPurchase[]> => {
      if (!storeId) return [];

      // Fetch real product prices for accurate mapping
      const { data: productsData } = await (supabase.from("merchant_credit_products") as any)
        .select("id, name, slug, price_cents, price_brl, credits_base, credits_bonus, credits_amount, credits_total");

      // Build multiple lookup maps for matching
      const priceByKey: Record<string, number> = {};
      const productList: { name: string; priceCents: number; totalCredits: number }[] = [];
      for (const p of (productsData || [])) {
        const priceCents = p.price_cents ?? (p.price_brl ? Math.round(p.price_brl * 100) : 0);
        const totalCredits = p.credits_total ?? p.credits_amount ?? ((p.credits_base || 0) + (p.credits_bonus || 0));
        if (p.slug) priceByKey[p.slug] = priceCents;
        if (p.name) priceByKey[p.name] = priceCents;
        if (p.id) priceByKey[p.id] = priceCents;
        if (totalCredits > 0) priceByKey[`credits_${totalCredits}`] = priceCents;
        if (p.name) productList.push({ name: p.name, priceCents, totalCredits });
      }

      // Helper: find price by searching product name inside a text
      const findPriceInText = (text: string | null | undefined): number => {
        if (!text) return 0;
        for (const prod of productList) {
          if (text.includes(prod.name)) return prod.priceCents;
        }
        return 0;
      };

      // Get credit entries from merchant_credit_ledger
      const { data: ledgerData } = await (supabase.from("merchant_credit_ledger") as any)
        .select("id, created_at, amount, reason_code, description, metadata")
        .eq("store_id", storeId)
        .eq("entry_type", "credit")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!ledgerData) return [];

      return ledgerData.map((e: any) => {
        const productName = e.metadata?.product_slug
          ? e.description || e.metadata.product_slug
          : e.description || MODULE_LABELS[e.reason_code] || e.reason_code;

        // Resolve real price: metadata → key lookup → name-in-description → credits match → 0
        const priceCents = e.metadata?.price_cents
          || e.metadata?.amount_cents
          || priceByKey[e.metadata?.product_slug]
          || priceByKey[e.metadata?.product_id]
          || findPriceInText(e.description)
          || findPriceInText(e.metadata?.product_name)
          || priceByKey[`credits_${e.amount}`]
          || 0;

        return {
          id: e.id,
          created_at: e.created_at,
          amount_cents: priceCents,
          credits_added: e.amount,
          product_name: productName,
          reason_code: e.reason_code,
          status: "confirmed",
        };
      });
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  // Module consumption breakdown
  const { data: consumption, isLoading: isLoadingConsumption } = useQuery({
    queryKey: ["merchant-pay-consumption", storeId],
    queryFn: async (): Promise<MerchantPayModuleConsumption[]> => {
      if (!storeId) return [];

      const { data } = await (supabase.from("merchant_credit_ledger") as any)
        .select("reason_code, amount")
        .eq("store_id", storeId)
        .eq("entry_type", "debit");

      if (!data) return [];

      // Group by reason_code
      const byModule: Record<string, { credits: number; count: number }> = {};
      data.forEach((e: any) => {
        const key = e.reason_code || "unknown";
        if (!byModule[key]) byModule[key] = { credits: 0, count: 0 };
        byModule[key].credits += e.amount;
        byModule[key].count += 1;
      });

      return Object.entries(byModule).map(([code, v]) => ({
        module: code,
        credits_consumed: v.credits,
        event_count: v.count,
        label: MODULE_LABELS[code] || code,
      })).sort((a, b) => b.credits_consumed - a.credits_consumed);
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  // Debit entries with justification
  const { data: debits, isLoading: isLoadingDebits } = useQuery({
    queryKey: ["merchant-pay-debits", storeId],
    queryFn: async (): Promise<MerchantPayDebitEntry[]> => {
      if (!storeId) return [];

      const { data } = await (supabase.from("merchant_credit_ledger") as any)
        .select("id, created_at, amount, reason_code, description, balance_after, purchase_intention_id")
        .eq("store_id", storeId)
        .eq("entry_type", "debit")
        .order("created_at", { ascending: false })
        .limit(30);

      return (data || []).map((e: any) => ({
        id: e.id,
        created_at: e.created_at,
        amount: e.amount,
        reason_code: e.reason_code,
        description: e.description || MODULE_LABELS[e.reason_code] || "Movimentação",
        balance_after: e.balance_after ?? 0,
        purchase_intention_id: e.purchase_intention_id,
      }));
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  // Recharge advice
  const { data: rechargeAdvice } = useQuery({
    queryKey: ["merchant-pay-recharge-advice", storeId, consumption],
    queryFn: async (): Promise<MerchantPayRechargeAdvice> => {
      if (!storeId) return { avgDailyConsumption: 0, daysRemaining: 999, suggestedPackage: "pacote-20", urgency: "low" };

      // Get balance
      const { data: balData } = await (supabase.from("merchant_credit_balances") as any)
        .select("available_credits")
        .eq("store_id", storeId)
        .maybeSingle();

      const available = balData?.available_credits ?? 0;

      // Get last 14 days debits
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const { data: recentDebits } = await (supabase.from("merchant_credit_ledger") as any)
        .select("amount")
        .eq("store_id", storeId)
        .eq("entry_type", "debit")
        .gte("created_at", twoWeeksAgo.toISOString());

      const totalConsumed = (recentDebits || []).reduce((s: number, e: any) => s + e.amount, 0);
      const avgDaily = totalConsumed / 14;
      const daysRemaining = avgDaily > 0 ? Math.floor(available / avgDaily) : 999;

      let urgency: "low" | "medium" | "high" | "critical" = "low";
      let suggestedPackage = "pacote-20";

      if (daysRemaining <= 2) { urgency = "critical"; suggestedPackage = "pacote-100"; }
      else if (daysRemaining <= 5) { urgency = "high"; suggestedPackage = "pacote-50"; }
      else if (daysRemaining <= 10) { urgency = "medium"; suggestedPackage = "pacote-50"; }

      return { avgDailyConsumption: Math.round(avgDaily * 10) / 10, daysRemaining, suggestedPackage, urgency };
    },
    enabled: !!storeId && !!consumption,
    staleTime: 60_000,
  });

  return {
    purchases: purchases ?? [],
    consumption: consumption ?? [],
    debits: debits ?? [],
    rechargeAdvice: rechargeAdvice ?? { avgDailyConsumption: 0, daysRemaining: 999, suggestedPackage: "pacote-20", urgency: "low" as const },
    storeId,
    isLoading: isLoadingPurchases || isLoadingConsumption || isLoadingDebits,
  };
}
