/**
 * useMerchantCredits — Hook for merchant credit system
 *
 * Uses REAL schema:
 * - merchant_credit_balances (store_id, available_credits, reserved_credits, consumed_credits)
 * - merchant_credit_ledger (store_id, purchase_intention_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
 * - merchant_credit_products (plans & packages)
 * - merchant_credit_subscriptions (active subscription)
 * - merchant_credit_usage_rules (cost per module event)
 * - merchant_credit_result_metrics (result by module)
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────

export interface CreditBalance {
  available_credits: number;
  reserved_credits: number;
  consumed_credits: number;
}

export interface CreditProduct {
  id: string;
  slug: string;
  name: string;
  type: "pacote" | "mensal" | "semestral" | "anual";
  credits_base: number;
  credits_bonus: number;
  credits_total: number;
  price_cents: number;
  price_brl?: number;
  credits_amount?: number;
  cost_per_credit_cents: number;
  rollover_enabled: boolean;
  rollover_percent: number;
  is_recommended: boolean;
  is_active: boolean;
  sort_order: number;
  description: string | null;
  badge_text: string | null;
  action_label: string | null;
  action_enabled: boolean;
  features_json: string[];
}

export interface CreditPackage {
  id: string;
  slug: string;
  name: string;
  package_type: string;
  credits_amount: number;
  price_brl: number;
  reference_credit_value_brl?: number;
  active: boolean;
}

export interface CreditSubscription {
  id: string;
  store_id: string;
  product_id: string;
  status: "active" | "paused" | "cancelled" | "expired";
  started_at: string;
  current_period_start: string;
  current_period_end: string | null;
  next_renewal_at: string | null;
  rollover_credits: number;
}

export interface LedgerEntry {
  id: string;
  store_id: string;
  purchase_intention_id: string | null;
  entry_type: "credit" | "debit";
  amount: number;
  balance_before: number;
  balance_after: number;
  reason_code: string;
  description: string | null;
  metadata: any;
  created_at: string;
}

export interface UsageRule {
  feature_code: string;
  module: string;
  event_type: string;
  credits_cost: number;
  description: string | null;
}

export interface ResultMetric {
  module: string;
  period_month: string;
  credits_spent: number;
  events_generated: number;
  revenue_generated_cents: number;
  intentions_received: number;
  clicks_generated: number;
}

export interface MerchantCreditsData {
  balance: CreditBalance;
  subscription: CreditSubscription | null;
  products: CreditProduct[];
  creditPackages: CreditPackage[];
  ledger: LedgerEntry[];
  usageRules: UsageRule[];
  resultMetrics: ResultMetric[];
  storeId: string | null;
}

// ─── Hook ───────────────────────────────

export function useMerchantCredits() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeIdFetched, setStoreIdFetched] = useState(false);

  // Get merchant store ID
  useEffect(() => {
    if (!user?.id) {
      setStoreIdFetched(true);
      return;
    }
    (async () => {
      try {
        const { data } = await (supabase.from("merchant_stores") as any)
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (data) setStoreId(data.id);
      } catch { /* no store */ }
      finally {
        setStoreIdFetched(true);
      }
    })();
  }, [user?.id]);

  // ── Fetch all credit data ──
  const {
    data,
    isLoading,
    refetch,
  } = useQuery<MerchantCreditsData>({
    queryKey: ["merchant-credits", storeId],
    queryFn: async (): Promise<MerchantCreditsData> => {
      const empty: MerchantCreditsData = {
        balance: { available_credits: 0, reserved_credits: 0, consumed_credits: 0 },
        subscription: null, products: [], creditPackages: [], ledger: [], usageRules: [], resultMetrics: [], storeId: null,
      };

      let balance: CreditBalance = { available_credits: 0, reserved_credits: 0, consumed_credits: 0 };
      let subscription: CreditSubscription | null = null;
      let ledger: LedgerEntry[] = [];
      let resultMetrics: ResultMetric[] = [];

      if (storeId) {
        // 1. Balance from merchant_credit_balances
        const { data: balData } = await (supabase.from("merchant_credit_balances") as any)
          .select("available_credits, reserved_credits, consumed_credits")
          .eq("store_id", storeId)
          .single();
        if (balData) {
          balance = {
            available_credits: balData.available_credits ?? 0,
            reserved_credits: balData.reserved_credits ?? 0,
            consumed_credits: balData.consumed_credits ?? 0,
          };
        }

        // 2. Active subscription
        const { data: subData } = await (supabase.from("merchant_credit_subscriptions") as any)
          .select("*")
          .eq("store_id", storeId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);
        if (subData && subData.length > 0) {
          const s = subData[0];
          subscription = {
            id: s.id,
            store_id: s.store_id,
            product_id: s.product_id,
            status: s.status,
            started_at: s.started_at,
            current_period_start: s.current_period_start,
            current_period_end: s.current_period_end,
            next_renewal_at: s.next_renewal_at,
            rollover_credits: s.rollover_credits || 0,
          };
        }
      }

      // 3. Available products
      const { data: productsData } = await (supabase.from("merchant_credit_products") as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      const products: CreditProduct[] = (productsData || []).map((p: any) => {
        const creditsTotal = p.credits_total ?? p.credits_amount ?? ((p.credits_base || 0) + (p.credits_bonus || 0));
        const priceCents = p.price_cents ?? (p.price_brl ? Math.round(p.price_brl * 100) : 0);
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          type: p.product_type || p.type,
          credits_base: p.credits_base || 0,
          credits_bonus: p.credits_bonus || 0,
          credits_total: creditsTotal,
          price_cents: priceCents,
          price_brl: p.price_brl,
          credits_amount: p.credits_amount,
          cost_per_credit_cents: p.cost_per_credit_cents ?? (creditsTotal > 0 ? Math.round(priceCents / creditsTotal) : 0),
          rollover_enabled: p.rollover_enabled ?? false,
          rollover_percent: p.rollover_percent ?? 0,
          is_recommended: p.is_recommended ?? false,
          is_active: p.is_active ?? true,
          sort_order: p.sort_order ?? 0,
          description: p.description,
          badge_text: p.badge_text,
          action_label: p.action_label ?? null,
          action_enabled: p.action_enabled ?? true,
          features_json: (() => {
             if (Array.isArray(p.features_json)) return p.features_json;
             if (typeof p.features_json === 'string') {
               try { return JSON.parse(p.features_json); } catch { return []; }
             }
             return [];
          })(),
        };
      });

      // 3.1 Fetch credit_packages (extra packages)
      let creditPackages: CreditPackage[] = [];
      try {
        const { data: pkgData } = await (supabase.from("credit_packages") as any)
          .select("*")
          .eq("is_active", true);
        if (pkgData) {
          creditPackages = pkgData.map((p: any) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            package_type: p.package_type,
            credits_amount: p.credits_amount,
            price_brl: p.price_brl,
            reference_credit_value_brl: p.reference_credit_value_brl,
            active: p.active
          }));
        }
      } catch (err) {
        console.warn("[useMerchantCredits] credit_packages fetch skipped or failed", err);
      }

      // 4. Ledger entries from merchant_credit_ledger
      if (storeId) {
        const { data: ledgerData } = await (supabase.from("merchant_credit_ledger") as any)
          .select("*")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(30);

        ledger = (ledgerData || []).map((e: any) => ({
          id: e.id,
          store_id: e.store_id,
          purchase_intention_id: e.purchase_intention_id || null,
          entry_type: e.entry_type,
          amount: e.amount,
          balance_before: e.balance_before ?? 0,
          balance_after: e.balance_after ?? 0,
          reason_code: e.reason_code || "",
          description: e.description,
          metadata: e.metadata,
          created_at: e.created_at,
        }));
      }

      // 5. Usage rules
      const { data: rulesData } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("*")
        .eq("is_active", true);

      const usageRules: UsageRule[] = (rulesData || []).map((r: any) => ({
        feature_code: r.feature_code || "",
        module: r.module_name || r.module,
        event_type: r.event_type,
        credits_cost: Number(r.credits_cost) || 0,
        description: r.feature_name || r.description,
      }));

      // 6. Result metrics (last 3 months)
      if (storeId) {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const monthStart = threeMonthsAgo.toISOString().slice(0, 10);
        // Schema real: period_date (date), period_type, credits_spent,
        // purchase_intentions_received, store_clicks/product_clicks/buy_clicks,
        // estimated_revenue_generated. (Não existem colunas module/period_month.)
        const { data: metricsData } = await (supabase.from("merchant_credit_result_metrics") as any)
          .select("*")
          .eq("store_id", storeId)
          .gte("period_date", monthStart);

        resultMetrics = (metricsData || []).map((m: any) => ({
          module: m.period_type ?? "geral",
          period_month: m.period_date,
          credits_spent: Number(m.credits_spent ?? 0),
          events_generated:
            Number(m.store_clicks ?? 0) +
            Number(m.product_clicks ?? 0) +
            Number(m.buy_clicks ?? 0) +
            Number(m.auction_interactions ?? 0) +
            Number(m.arremate_interactions ?? 0),
          revenue_generated_cents: Math.round(Number(m.estimated_revenue_generated ?? 0) * 100),
          intentions_received: Number(m.purchase_intentions_received ?? 0),
          clicks_generated:
            Number(m.store_clicks ?? 0) +
            Number(m.product_clicks ?? 0) +
            Number(m.buy_clicks ?? 0),
        }));
      }

      return { balance, subscription, products, creditPackages, ledger, usageRules, resultMetrics, storeId };
    },
    enabled: storeIdFetched,
    refetchInterval: 30_000,
  });

  // ── Realtime: instant product updates ──
  useEffect(() => {
    const channel = supabase
      .channel("credit-products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_credit_products" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["merchant-credits"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ── Create credit purchase (awaiting_payment — does NOT credit directly) ──
  const createCreditOrder = useCallback(async (product: CreditProduct, paymentMethod: "pix" | "boleto" | "cartao") => {
    if (!storeId) throw new Error("Loja não encontrada");

    const creditsToAdd = product.credits_total;

    // Generate PIX code placeholder
    const pixCode = paymentMethod === "pix"
      ? `00020126580014br.gov.bcb.pix0136viagg-tx8-creditos-${Date.now()}520400005303986540${(product.price_cents / 100).toFixed(2)}5802BR5925VIAGG TX8 PLATAFORMA6009SAO PAULO62070503***6304`
      : null;

    // Generate Boleto placeholder
    const boletoLine = paymentMethod === "boleto"
      ? `23793.38128 60000.000${Math.floor(Math.random() * 90000000 + 10000000)} ${Math.floor(Math.random() * 9 + 1)} ${Math.floor(Date.now() / 1000).toString().slice(-8)}`
      : null;

    const providerPaymentId = pixCode || boletoLine || `cartao-${Date.now()}`;

    const { data: order, error } = await (supabase.from("credit_purchases") as any)
      .insert({
        store_id: storeId,
        product_name: product.name,
        amount_paid: product.price_cents / 100,
        credits_granted: creditsToAdd,
        status: "awaiting_payment",
        provider_name: paymentMethod,
        provider_payment_id: providerPaymentId,
        metadata: {
          product_id: product.id,
          product_slug: product.slug,
          product_type: product.type,
          credits_base: product.credits_base,
          credits_bonus: product.credits_bonus,
          price_cents: product.price_cents,
          pix_code: pixCode,
          boleto_line: boletoLine,
        },
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Attach PIX/boleto info for frontend display
    return {
      ...order,
      pix_code: pixCode,
      boleto_line: boletoLine,
    };
  }, [storeId]);

  // ── Poll order status ──
  const getOrderStatus = useCallback(async (orderId: string) => {
    const { data, error } = await (supabase.from("credit_purchases") as any)
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) return null;
    // Re-attach pix/boleto from metadata for display
    return {
      ...data,
      pix_code: data?.metadata?.pix_code || null,
      boleto_line: data?.metadata?.boleto_line || null,
    };
  }, []);

  // ── Cancel order ──
  const cancelOrder = useCallback(async (orderId: string) => {
    await (supabase.from("credit_purchases") as any)
      .update({ status: "cancelled" })
      .eq("id", orderId);
  }, []);

  // ── Legacy: purchaseCredits (kept for backward compat, wraps createCreditOrder) ──
  const purchaseCredits = useCallback(async (product: CreditProduct) => {
    return createCreditOrder(product, "pix");
  }, [createCreditOrder]);

  // ── Debit credits (called by modules) ──
  const debitCredits = useCallback(async (params: {
    amount: number;
    reasonCode: string;
    description: string;
    purchaseIntentionId?: string;
    metadata?: any;
  }) => {
    if (!storeId) return false;

    const { data: balRow } = await (supabase.from("merchant_credit_balances") as any)
      .select("available_credits, consumed_credits")
      .eq("store_id", storeId)
      .single();

    const currentBalance = balRow?.available_credits ?? 0;
    if (currentBalance < params.amount) return false;

    const newBalance = currentBalance - params.amount;
    const newConsumed = (balRow?.consumed_credits ?? 0) + params.amount;

    await (supabase.from("merchant_credit_balances") as any)
      .update({ available_credits: newBalance, consumed_credits: newConsumed, updated_at: new Date().toISOString() })
      .eq("store_id", storeId);

    await (supabase.from("merchant_credit_ledger") as any).insert({
      store_id: storeId,
      purchase_intention_id: params.purchaseIntentionId || null,
      entry_type: "debit",
      amount: params.amount,
      balance_before: currentBalance,
      balance_after: newBalance,
      reason_code: params.reasonCode,
      description: params.description,
      metadata: params.metadata || {},
    });

    queryClient.invalidateQueries({ queryKey: ["merchant-credits"] });
    return true;
  }, [storeId, queryClient]);

  return {
    balance: data?.balance ?? { available_credits: 0, reserved_credits: 0, consumed_credits: 0 },
    subscription: data?.subscription ?? null,
    products: data?.products ?? [],
    creditPackages: data?.creditPackages ?? [],
    ledger: data?.ledger ?? [],
    usageRules: data?.usageRules ?? [],
    resultMetrics: data?.resultMetrics ?? [],
    storeId: data?.storeId ?? storeId,
    isLoading,
    refetch,
    purchaseCredits,
    createCreditOrder,
    getOrderStatus,
    cancelOrder,
    debitCredits,
  };
}
