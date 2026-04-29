/**
 * useAdminCredits â€” Admin hook for the Credits & Monetization module
 *
 * Connects to ALL real credit tables:
 *  - merchant_credit_balances   (balance / available_credits, total_earned, total_spent / consumed)
 *  - merchant_credit_ledger     (credits / amount, reason / reason_code, intention_id)
 *  - merchant_credit_products   (packages & plans catalog)
 *  - merchant_credit_subscriptions (active subs)
 *  - merchant_credit_usage_rules (cost per event)
 *  - merchant_credit_result_metrics (monthly module metrics)
 *  - m1_billing_events          (store_view, product_click, buy_click, purchase_completed)
 *  - m1_billing_entries         (auto-charges)
 *  - m1_billing_rules           (charge rules)
 *  - purchase_intentions        (credits_charged)
 *  - merchant_stores            (store info, user_id)
 */
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAdmin } from "@/integrations/supabase/adminClient";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface AdminCreditProduct {
  id: string;
  slug: string | null;
  name: string | null;
  product_type: string | null;
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
  action_label: string | null;
  action_enabled: boolean;
  features_json: string[];
  created_at: string;
  updated_at: string | null;
  // computed
  purchase_count?: number;
  total_revenue_cents?: number;
}

export interface AdminCreditSubscription {
  id: string;
  store_id: string;
  product_id: string;
  status: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_renewal_at: string | null;
  cancelled_at: string | null;
  paused_at: string | null;
  rollover_credits: number;
  created_at: string;
  // joined
  store_name?: string;
  user_email?: string;
  product_name?: string;
  product_type?: string;
  credits_per_cycle?: number;
}

export interface AdminCreditBalance {
  id: string;
  store_id: string;
  balance: number;
  available_credits: number;
  total_earned: number;
  total_spent: number;
  consumed_credits: number;
  reserved_credits: number;
  updated_at: string | null;
  // joined
  store_name?: string;
  user_email?: string;
  user_name?: string;
  subscription_status?: string | null;
  last_debit_at?: string | null;
  last_credit_at?: string | null;
}

export interface AdminLedgerEntry {
  id: string;
  store_id: string;
  credits: number;
  amount: number;
  balance_after: number;
  balance_before: number;
  reason: string | null;
  reason_code: string | null;
  description: string | null;
  rule_applied: string | null;
  entry_type: string | null;
  intention_id: string | null;
  purchase_intention_id: string | null;
  metadata: any;
  created_at: string;
  // joined
  store_name?: string;
  user_email?: string;
}

export interface AdminBillingEvent {
  id: string;
  merchant_store_id: string;
  product_id: string | null;
  event_type: string;
  source_type: string;
  source_id: string | null;
  campaign_id: string | null;
  city: string | null;
  bairro: string | null;
  sale_value_cents: number;
  created_at: string;
  // joined
  store_name?: string;
  charge_amount_cents?: number;
}

export interface AuditIssue {
  severity: "critical" | "warning" | "info";
  type: string;
  store_id: string;
  store_name: string;
  description: string;
  suggestion: string;
  reference: string;
  detected_at: string;
}

export interface AdminCreditsOverviewData {
  totalCreditsSold: number;
  totalCreditsConsumed: number;
  totalCreditsActive: number;
  totalRevenueBRL: number;
  activeSubscriptions: number;
  storesWithBalance: number;
  storesWithoutBalance: number;
  avgConsumptionRate: number;
  avgTicketBRL: number;
  topConsumers: { store_name: string; consumed: number }[];
  topBalances: { store_name: string; balance: number }[];
  topPackages: { name: string; count: number }[];
}

// â”€â”€â”€ Main Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function useAdminCredits() {
  const qc = useQueryClient();

  // â”€â”€ 1. Products (packages & plans) â”€â”€
  const products = useQuery({
    queryKey: ["admin-credits-products"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_products") as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        product_type: p.product_type,
        credits_amount: p.credits_amount ?? ((p.credits_base || 0) + (p.credits_bonus || 0)),
        credits_base: p.credits_base || 0,
        credits_bonus: p.credits_bonus || 0,
        price_brl: p.price_brl ?? (p.price_cents ? p.price_cents / 100 : 0),
        price_cents: p.price_cents ?? (p.price_brl ? Math.round(p.price_brl * 100) : 0),
        rollover_enabled: p.rollover_enabled ?? false,
        rollover_percent: p.rollover_percent ?? 0,
        is_recommended: p.is_recommended ?? false,
        is_active: p.is_active ?? true,
        sort_order: p.sort_order ?? 0,
        description: p.description,
        badge_text: p.badge_text,
        action_label: p.action_label ?? null,
        action_enabled: p.action_enabled ?? true,
        features_json: p.features_json || [],
        created_at: p.created_at,
        updated_at: p.updated_at,
      })) as AdminCreditProduct[];
    },
    refetchInterval: 30_000,
  });

  // â”€â”€ 2. Subscriptions â”€â”€
  const subscriptions = useQuery({
    queryKey: ["admin-credits-subscriptions"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_subscriptions") as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Enrich with store + product info
      const storeIds = [...new Set((data || []).map((s: any) => s.store_id))];
      const productIds = [...new Set((data || []).map((s: any) => s.product_id).filter(Boolean))];

      const storeMap = await fetchStoreMap(storeIds as string[]);
      const prodMap = await fetchProductMap(productIds as string[]);

      return (data || []).map((s: any) => {
        const store = storeMap[s.store_id];
        const prod = prodMap[s.product_id];
        return {
          ...s,
          rollover_credits: s.rollover_credits || 0,
          store_name: store?.store_name || "â€”",
          user_email: store?.email || "â€”",
          product_name: prod?.name || "â€”",
          product_type: prod?.product_type || "â€”",
          credits_per_cycle: prod?.credits_amount || 0,
        } as AdminCreditSubscription;
      });
    },
    refetchInterval: 30_000,
  });

  // â”€â”€ 3. Balances â”€â”€
  const balances = useQuery({
    queryKey: ["admin-credits-balances"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_balances") as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const storeIds = [...new Set((data || []).map((b: any) => b.store_id))];
      const storeMap = await fetchStoreMap(storeIds as string[]);

      // Get last debit/credit dates from ledger
      const { data: ledgerAgg } = await (supabase.from("merchant_credit_ledger") as any)
        .select("store_id, created_at, credits, entry_type, amount")
        .order("created_at", { ascending: false });

      const lastDebitMap: Record<string, string> = {};
      const lastCreditMap: Record<string, string> = {};
      for (const e of (ledgerAgg || [])) {
        const sid = e.store_id;
        const isDebit = (e.entry_type === "debit") || (e.credits != null && e.credits < 0);
        const isCredit = (e.entry_type === "credit") || (e.credits != null && e.credits > 0);
        if (isDebit && !lastDebitMap[sid]) lastDebitMap[sid] = e.created_at;
        if (isCredit && !lastCreditMap[sid]) lastCreditMap[sid] = e.created_at;
      }

      // Get active subscription per store
      const subMap: Record<string, string> = {};
      for (const s of (subscriptions.data || [])) {
        if (s.status === "active") subMap[s.store_id] = "active";
      }

      return (data || []).map((b: any) => {
        const store = storeMap[b.store_id];
        return {
          id: b.id,
          store_id: b.store_id,
          balance: b.balance ?? b.available_credits ?? 0,
          available_credits: b.available_credits ?? b.balance ?? 0,
          total_earned: b.total_earned ?? 0,
          total_spent: b.total_spent ?? b.consumed_credits ?? 0,
          consumed_credits: b.consumed_credits ?? b.total_spent ?? 0,
          reserved_credits: b.reserved_credits ?? 0,
          updated_at: b.updated_at,
          store_name: store?.store_name || "â€”",
          user_email: store?.email || "â€”",
          user_name: store?.full_name || "â€”",
          subscription_status: subMap[b.store_id] || null,
          last_debit_at: lastDebitMap[b.store_id] || null,
          last_credit_at: lastCreditMap[b.store_id] || null,
        } as AdminCreditBalance;
      });
    },
    refetchInterval: 30_000,
    enabled: subscriptions.isFetched,
  });

  // â”€â”€ 4. Ledger â”€â”€
  const ledger = useQuery({
    queryKey: ["admin-credits-ledger"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_ledger") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const storeIds = [...new Set((data || []).map((e: any) => e.store_id))];
      const storeMap = await fetchStoreMap(storeIds as string[]);

      return (data || []).map((e: any) => ({
        id: e.id,
        store_id: e.store_id,
        credits: e.credits ?? 0,
        amount: e.amount ?? Math.abs(e.credits ?? 0),
        balance_after: e.balance_after ?? 0,
        balance_before: e.balance_before ?? 0,
        reason: e.reason,
        reason_code: e.reason_code,
        description: e.description,
        rule_applied: e.rule_applied,
        entry_type: e.entry_type ?? (e.credits >= 0 ? "credit" : "debit"),
        intention_id: e.intention_id,
        purchase_intention_id: e.purchase_intention_id,
        metadata: e.metadata,
        created_at: e.created_at,
        store_name: storeMap[e.store_id]?.store_name || "â€”",
        user_email: storeMap[e.store_id]?.email || "â€”",
      })) as AdminLedgerEntry[];
    },
    refetchInterval: 30_000,
  });

  // â”€â”€ 5. M1 Billing Events â”€â”€
  const billingEvents = useQuery({
    queryKey: ["admin-credits-billing-events"],
    queryFn: async () => {
      const { data: events, error } = await (supabase.from("m1_billing_events") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const storeIds = [...new Set((events || []).map((e: any) => e.merchant_store_id))];
      const storeMap = await fetchStoreMap(storeIds as string[]);

      // get matching entries for charges
      const eventIds = (events || []).map((e: any) => e.id);
      const { data: entries } = await (supabase.from("m1_billing_entries") as any)
        .select("billing_event_id, charge_amount_cents")
        .in("billing_event_id", eventIds.slice(0, 200));

      const chargeMap: Record<string, number> = {};
      for (const en of (entries || [])) {
        chargeMap[en.billing_event_id] = en.charge_amount_cents || 0;
      }

      return (events || []).map((e: any) => ({
        id: e.id,
        merchant_store_id: e.merchant_store_id,
        product_id: e.product_id,
        event_type: e.event_type,
        source_type: e.source_type,
        source_id: e.source_id,
        campaign_id: e.campaign_id,
        city: e.city,
        bairro: e.bairro,
        sale_value_cents: e.sale_value_cents || 0,
        created_at: e.created_at,
        store_name: storeMap[e.merchant_store_id]?.store_name || "â€”",
        charge_amount_cents: chargeMap[e.id] ?? 0,
      })) as AdminBillingEvent[];
    },
    refetchInterval: 60_000,
  });

  // â”€â”€ 6. Usage Rules â”€â”€
  const usageRules = useQuery({
    queryKey: ["admin-credits-usage-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // â”€â”€ 7. Overview computed â”€â”€
  const overview: AdminCreditsOverviewData = (() => {
    const bals = balances.data || [];
    const leds = ledger.data || [];
    const prods = products.data || [];
    const subs = subscriptions.data || [];

    const totalCreditsSold = bals.reduce((s, b) => s + b.total_earned, 0);
    const totalCreditsConsumed = bals.reduce((s, b) => s + (b.total_spent || b.consumed_credits), 0);
    const totalCreditsActive = bals.reduce((s, b) => s + (b.balance || b.available_credits), 0);

    // Revenue from ledger credit entries
    const creditEntries = leds.filter(e => e.entry_type === "credit" || (e.credits > 0));
    // Estimate: match with product price - rough calc from ledger metadata
    const totalRevenueBRL = prods.reduce((s, p) => s + (p.price_brl || 0) * (p.purchase_count || 0), 0);

    const activeSubscriptions = subs.filter(s => s.status === "active").length;
    const storesWithBalance = bals.filter(b => (b.balance || b.available_credits) > 0).length;
    const storesWithoutBalance = bals.filter(b => (b.balance || b.available_credits) <= 0).length;
    const avgConsumptionRate = totalCreditsSold > 0 ? Math.round((totalCreditsConsumed / totalCreditsSold) * 100) : 0;

    // Ticket calculation
    const purchaseEntries = creditEntries.length;
    const avgTicketBRL = purchaseEntries > 0 ? totalRevenueBRL / purchaseEntries : 0;

    // Top consumers
    const topConsumers = [...bals]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
      .map(b => ({ store_name: b.store_name || "â€”", consumed: b.total_spent }));

    // Top balances
    const topBalances = [...bals]
      .sort((a, b) => (b.balance || b.available_credits) - (a.balance || a.available_credits))
      .slice(0, 10)
      .map(b => ({ store_name: b.store_name || "â€”", balance: b.balance || b.available_credits }));

    // Top packages
    const topPackages = prods.map(p => ({
      name: p.name || p.slug || "â€”",
      count: p.purchase_count || 0,
    }));

    return {
      totalCreditsSold,
      totalCreditsConsumed,
      totalCreditsActive,
      totalRevenueBRL,
      activeSubscriptions,
      storesWithBalance,
      storesWithoutBalance,
      avgConsumptionRate,
      avgTicketBRL,
      topConsumers,
      topBalances,
      topPackages,
    };
  })();

  // â”€â”€ 8. Audit â”€â”€
  const audit = (() => {
    const issues: AuditIssue[] = [];
    const bals = balances.data || [];
    const leds = ledger.data || [];
    const subs = subscriptions.data || [];

    // Negative balance
    for (const b of bals) {
      if ((b.balance || b.available_credits) < 0) {
        issues.push({
          severity: "critical",
          type: "Saldo Negativo",
          store_id: b.store_id,
          store_name: b.store_name || "â€”",
          description: `Saldo negativo: ${b.balance || b.available_credits} crÃ©ditos`,
          suggestion: "Verificar ledger e corrigir saldo manualmente",
          reference: `balance_id:${b.id}`,
          detected_at: new Date().toISOString(),
        });
      }
    }

    // Balance divergence: compare balance vs ledger sum
    const ledgerSumByStore: Record<string, number> = {};
    for (const e of leds) {
      const val = e.credits ?? (e.entry_type === "debit" ? -(e.amount || 0) : (e.amount || 0));
      ledgerSumByStore[e.store_id] = (ledgerSumByStore[e.store_id] || 0) + val;
    }

    for (const b of bals) {
      const ledgerSum = ledgerSumByStore[b.store_id];
      if (ledgerSum !== undefined) {
        const currentBal = b.balance || b.available_credits;
        // Allow small tolerance
        if (Math.abs(currentBal - ledgerSum) > 2) {
          issues.push({
            severity: "warning",
            type: "DivergÃªncia de Saldo",
            store_id: b.store_id,
            store_name: b.store_name || "â€”",
            description: `Saldo atual (${currentBal}) diverge do ledger (${ledgerSum}). DiferenÃ§a: ${currentBal - ledgerSum}`,
            suggestion: "Recalcular saldo baseado no ledger completo",
            reference: `store_id:${b.store_id}`,
            detected_at: new Date().toISOString(),
          });
        }
      }
    }

    // Active subscription but no balance entry
    for (const s of subs) {
      if (s.status === "active") {
        const hasBal = bals.some(b => b.store_id === s.store_id);
        if (!hasBal) {
          issues.push({
            severity: "warning",
            type: "Assinatura sem Saldo",
            store_id: s.store_id,
            store_name: s.store_name || "â€”",
            description: "Assinatura ativa sem registro de saldo",
            suggestion: "Criar registro de saldo para esta loja",
            reference: `subscription_id:${s.id}`,
            detected_at: new Date().toISOString(),
          });
        }
      }
    }

    return issues;
  })();

  // â”€â”€ Mutations â”€â”€

  // Use admin client (backend_admin) to bypass RLS for write operations
  const adminDb = supabaseAdmin || supabase;

  const toggleProduct = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (adminDb.from("merchant_credit_products") as any)
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-credits-products"] }),
  });

  const updateProduct = useMutation({
    mutationFn: async (updates: { id: string; [key: string]: any }) => {
      const { id, ...rest } = updates;
      // Remove campos gerados ou nÃ£o permitidos no UPDATE
      const { credits_amount, price_brl, ...allowed } = rest;
      const { error } = await (adminDb.from("merchant_credit_products") as any)
        .update(allowed)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-credits-products"] }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (adminDb.from("merchant_credit_products") as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-credits-products"] }),
  });

   const createProduct = useMutation({
     mutationFn: async (input: {
       name: string;
       product_type: string;
       credits_base: number;
       credits_bonus: number;
       price_brl: number;
       description?: string;
       badge_text?: string;
       action_label?: string;
       action_enabled?: boolean;
       sort_order?: number;
       is_recommended?: boolean;
       rollover_enabled?: boolean;
       rollover_percent?: number;
       features_json?: string[];
     }) => {
       const slug = input.name
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/(^-|-$)/g, "");
       const totalCredits = (input.credits_base || 0) + (input.credits_bonus || 0);
       if (totalCredits <= 0) {
         throw new Error('O total de crÃ©ditos deve ser maior que zero');
       }
       const price_cents = Math.round(input.price_brl * 100);
       const { error } = await (adminDb.from("merchant_credit_products") as any)
         .insert({
           slug,
           name: input.name,
           product_type: input.product_type || "pacote",
           credits_base: input.credits_base,
           credits_bonus: input.credits_bonus,
           price_cents,
           description: input.description || null,
           badge_text: input.badge_text || null,
           action_label: input.action_label || null,
           action_enabled: input.action_enabled ?? true,
           sort_order: input.sort_order ?? 0,
           is_recommended: input.is_recommended ?? false,
           is_active: true,
           rollover_enabled: input.rollover_enabled ?? false,
           rollover_percent: input.rollover_percent ?? 0,
           features_json: input.features_json || [],
         });
       if (error) throw error;
     },
     onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-credits-products"] }),
   });

  const isLoading = products.isLoading || subscriptions.isLoading || balances.isLoading || ledger.isLoading;

  // â”€â”€ Realtime: instant product updates â”€â”€
  useEffect(() => {
    const channel = supabase
      .channel("admin-credit-products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_credit_products" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-credits-products"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return {
    products: products.data || [],
    subscriptions: subscriptions.data || [],
    balances: balances.data || [],
    ledger: ledger.data || [],
    billingEvents: billingEvents.data || [],
    usageRules: usageRules.data || [],
    overview,
    audit,
    isLoading,
    toggleProduct,
    updateProduct,
    deleteProduct,
    createProduct,
    refetch: () => {
      qc.invalidateQueries({ queryKey: ["admin-credits-products"] });
      qc.invalidateQueries({ queryKey: ["admin-credits-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["admin-credits-balances"] });
      qc.invalidateQueries({ queryKey: ["admin-credits-ledger"] });
      qc.invalidateQueries({ queryKey: ["admin-credits-billing-events"] });
    },
  };
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fetchStoreMap(storeIds: string[]): Promise<Record<string, { store_name: string; email: string; full_name: string }>> {
  if (!storeIds.length) return {};
  const { data: stores } = await (supabase.from("merchant_stores") as any)
    .select("id, store_name, user_id")
    .in("id", storeIds);

  const userIds = (stores || []).map((s: any) => s.user_id).filter(Boolean);
  const { data: profiles } = await (supabase.from("profiles") as any)
    .select("id, email, full_name")
    .in("id", userIds);

  const profileMap: Record<string, { email: string; full_name: string }> = {};
  for (const p of (profiles || [])) {
    profileMap[p.id] = { email: p.email || "", full_name: p.full_name || "" };
  }

  const result: Record<string, { store_name: string; email: string; full_name: string }> = {};
  for (const s of (stores || [])) {
    const prof = profileMap[s.user_id] || { email: "", full_name: "" };
    result[s.id] = {
      store_name: s.store_name || "Sem nome",
      email: prof.email,
      full_name: prof.full_name,
    };
  }
  return result;
}

async function fetchProductMap(productIds: string[]): Promise<Record<string, { name: string; product_type: string; credits_amount: number }>> {
  if (!productIds.length) return {};
  const { data } = await (supabase.from("merchant_credit_products") as any)
    .select("id, name, product_type, credits_amount, credits_base, credits_bonus")
    .in("id", productIds);

  const result: Record<string, { name: string; product_type: string; credits_amount: number }> = {};
  for (const p of (data || [])) {
    result[p.id] = {
      name: p.name || p.id,
      product_type: p.product_type || "â€”",
      credits_amount: p.credits_amount ?? ((p.credits_base || 0) + (p.credits_bonus || 0)),
    };
  }
  return result;
}

// â”€â”€â”€ CSV Export Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function exportToCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(";"),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val).replace(/;/g, ",");
        return String(val).replace(/;/g, ",");
      }).join(";")
    ),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

