/**
 * useM1Metrics — Hook for M1 Monetization Panel
 *
 * Fetches aggregated metrics and billing extract for the current merchant.
 * Uses merchant_store_id (= merchant_stores.id) as the key.
 * Auto-refreshes every 60 seconds.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ──────────────────────────────
export interface M1SourceBreakdown {
  source_type: string;
  store_views: number;
  product_clicks: number;
  buy_clicks: number;
  purchases: number;
}

export interface M1BairroBreakdown {
  bairro: string;
  city: string;
  store_views: number;
  product_clicks: number;
  buy_clicks: number;
  purchases: number;
}

export interface M1ProductBreakdown {
  product_id: string;
  product_title?: string;
  store_views: number;
  product_clicks: number;
  buy_clicks: number;
  purchases: number;
}

export interface M1DailyPoint {
  date: string;
  store_views: number;
  product_clicks: number;
  buy_clicks: number;
  purchases: number;
}

export interface M1CampaignBreakdown {
  campaign_id: string;
  store_views: number;
  product_clicks: number;
  buy_clicks: number;
  purchases: number;
}

export interface M1BillingEntry {
  id: string;
  event_type: string;
  charge_amount_cents: number;
  sale_value_cents: number;
  status: string;
  description: string;
  created_at: string;
  source_type: string;
  bairro: string;
  city: string;
  product_id: string | null;
}

export interface M1Metrics {
  store_views: number;
  product_clicks: number;
  buy_clicks: number;
  purchases: number;
  total_sale_cents: number;
  total_charged_cents: number;
  avg_ticket_cents: number;
  conversion_rate: number;
  by_source: M1SourceBreakdown[];
  by_bairro: M1BairroBreakdown[];
  by_product: M1ProductBreakdown[];
  daily: M1DailyPoint[];
  by_campaign: M1CampaignBreakdown[];
}

type Period = "7d" | "14d" | "30d" | "90d";

function getPeriodDates(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const days = period === "7d" ? 7 : period === "14d" ? 14 : period === "90d" ? 90 : 30;
  const from = new Date(now.getTime() - days * 86400000).toISOString();
  return { from, to };
}

const EMPTY_METRICS: M1Metrics = {
  store_views: 0,
  product_clicks: 0,
  buy_clicks: 0,
  purchases: 0,
  total_sale_cents: 0,
  total_charged_cents: 0,
  avg_ticket_cents: 0,
  conversion_rate: 0,
  by_source: [],
  by_bairro: [],
  by_product: [],
  daily: [],
  by_campaign: [],
};

// ─── Hook ───────────────────────────────
export function useM1Metrics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const [extractPage, setExtractPage] = useState(0);

  const userId = user?.id;
  const { from, to } = useMemo(() => getPeriodDates(period), [period]);

  // ── First: resolve merchant_store_id from user_id ──
  const { data: merchantStoreId } = useQuery({
    queryKey: ["m1-store-id", userId],
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_stores") as any)
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      return data?.id as string | null;
    },
    enabled: !!userId,
    staleTime: 300_000,
  });

  // ── Metrics RPC (uses merchant_store_id) — with fallback ──
  const {
    data: metricsRaw,
    isLoading: loadingMetrics,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["m1-metrics", merchantStoreId, period],
    queryFn: async () => {
      // Try RPC first
      try {
        const { data, error } = await (supabase.rpc as any)("m1_get_merchant_metrics", {
          p_merchant_store_id: merchantStoreId,
          p_from: from,
          p_to: to,
        });
        if (!error && data && typeof data === "object" && "store_views" in data) {
          return data as M1Metrics;
        }
      } catch {
        // RPC might not exist, fall through to direct query
      }

      // Fallback: direct query from m1_billing_events
      console.debug("[useM1Metrics] RPC unavailable, using direct query fallback");
      const { data: events } = await (supabase.from("m1_billing_events") as any)
        .select("event_type, source_type, product_id, city, bairro, sale_value_cents, campaign_id, created_at")
        .eq("merchant_store_id", merchantStoreId)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(5000);

      const rows = (events || []) as any[];
      const store_views = rows.filter(r => r.event_type === "store_view").length;
      const product_clicks = rows.filter(r => r.event_type === "product_click").length;
      const buy_clicks = rows.filter(r => r.event_type === "buy_click").length;
      const purchases = rows.filter(r => r.event_type === "purchase_completed").length;
      const total_sale_cents = rows.filter(r => r.event_type === "purchase_completed")
        .reduce((s, r) => s + (r.sale_value_cents || 0), 0);

      // by_source
      const srcMap = new Map<string, { sv: number; pc: number; bc: number; pu: number }>();
      rows.forEach(r => {
        const key = r.source_type || "direct";
        const cur = srcMap.get(key) || { sv: 0, pc: 0, bc: 0, pu: 0 };
        if (r.event_type === "store_view") cur.sv++;
        else if (r.event_type === "product_click") cur.pc++;
        else if (r.event_type === "buy_click") cur.bc++;
        else if (r.event_type === "purchase_completed") cur.pu++;
        srcMap.set(key, cur);
      });
      const by_source: M1SourceBreakdown[] = Array.from(srcMap.entries()).map(([k, v]) => ({
        source_type: k, store_views: v.sv, product_clicks: v.pc, buy_clicks: v.bc, purchases: v.pu,
      })).sort((a, b) => b.store_views - a.store_views);

      // by_bairro
      const bairroMap = new Map<string, { city: string; sv: number; pc: number; bc: number; pu: number }>();
      rows.forEach(r => {
        const bKey = r.bairro || "Desconhecido";
        const cur = bairroMap.get(bKey) || { city: r.city || "", sv: 0, pc: 0, bc: 0, pu: 0 };
        if (r.event_type === "store_view") cur.sv++;
        else if (r.event_type === "product_click") cur.pc++;
        else if (r.event_type === "buy_click") cur.bc++;
        else if (r.event_type === "purchase_completed") cur.pu++;
        bairroMap.set(bKey, cur);
      });
      const by_bairro: M1BairroBreakdown[] = Array.from(bairroMap.entries()).map(([k, v]) => ({
        bairro: k, city: v.city, store_views: v.sv, product_clicks: v.pc, buy_clicks: v.bc, purchases: v.pu,
      })).sort((a, b) => b.store_views - a.store_views).slice(0, 20);

      // by_product
      const prodMap = new Map<string, { sv: number; pc: number; bc: number; pu: number }>();
      rows.filter(r => r.product_id).forEach(r => {
        const cur = prodMap.get(r.product_id) || { sv: 0, pc: 0, bc: 0, pu: 0 };
        if (r.event_type === "store_view") cur.sv++;
        else if (r.event_type === "product_click") cur.pc++;
        else if (r.event_type === "buy_click") cur.bc++;
        else if (r.event_type === "purchase_completed") cur.pu++;
        prodMap.set(r.product_id, cur);
      });
      const by_product: M1ProductBreakdown[] = Array.from(prodMap.entries()).map(([k, v]) => ({
        product_id: k, store_views: v.sv, product_clicks: v.pc, buy_clicks: v.bc, purchases: v.pu,
      })).sort((a, b) => (b.product_clicks + b.buy_clicks) - (a.product_clicks + a.buy_clicks)).slice(0, 10);

      // daily
      const dayMap = new Map<string, { sv: number; pc: number; bc: number; pu: number }>();
      rows.forEach(r => {
        const dt = r.created_at?.split("T")[0] || "";
        if (!dt) return;
        const cur = dayMap.get(dt) || { sv: 0, pc: 0, bc: 0, pu: 0 };
        if (r.event_type === "store_view") cur.sv++;
        else if (r.event_type === "product_click") cur.pc++;
        else if (r.event_type === "buy_click") cur.bc++;
        else if (r.event_type === "purchase_completed") cur.pu++;
        dayMap.set(dt, cur);
      });
      const daily: M1DailyPoint[] = Array.from(dayMap.entries()).map(([k, v]) => ({
        date: k, store_views: v.sv, product_clicks: v.pc, buy_clicks: v.bc, purchases: v.pu,
      })).sort((a, b) => a.date.localeCompare(b.date));

      // by_campaign
      const campMap = new Map<string, { sv: number; pc: number; bc: number; pu: number }>();
      rows.filter(r => r.campaign_id).forEach(r => {
        const cur = campMap.get(r.campaign_id) || { sv: 0, pc: 0, bc: 0, pu: 0 };
        if (r.event_type === "store_view") cur.sv++;
        else if (r.event_type === "product_click") cur.pc++;
        else if (r.event_type === "buy_click") cur.bc++;
        else if (r.event_type === "purchase_completed") cur.pu++;
        campMap.set(r.campaign_id, cur);
      });
      const by_campaign: M1CampaignBreakdown[] = Array.from(campMap.entries()).map(([k, v]) => ({
        campaign_id: k, store_views: v.sv, product_clicks: v.pc, buy_clicks: v.bc, purchases: v.pu,
      })).sort((a, b) => (b.product_clicks + b.buy_clicks) - (a.product_clicks + a.buy_clicks)).slice(0, 10);

      // Billing totals
      const { data: billingData } = await (supabase.from("m1_billing_entries") as any)
        .select("charge_amount_cents, sale_value_cents")
        .eq("merchant_store_id", merchantStoreId)
        .eq("status", "charged")
        .gte("created_at", from)
        .lte("created_at", to);
      const billingRows = (billingData || []) as any[];
      const total_charged_cents = billingRows.reduce((s, r) => s + (r.charge_amount_cents || 0), 0);

      const purchaseEvents = rows.filter(r => r.event_type === "purchase_completed" && r.sale_value_cents > 0);
      const avg_ticket_cents = purchaseEvents.length > 0
        ? Math.round(purchaseEvents.reduce((s, r) => s + r.sale_value_cents, 0) / purchaseEvents.length)
        : 0;

      const conversion_rate = store_views > 0
        ? Math.round((purchases / store_views) * 10000) / 100
        : 0;

      return {
        store_views, product_clicks, buy_clicks, purchases,
        total_sale_cents, total_charged_cents, avg_ticket_cents, conversion_rate,
        by_source, by_bairro, by_product, daily, by_campaign,
      } as M1Metrics;
    },
    enabled: !!merchantStoreId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // ── Product titles enrichment ──
  const productIds = useMemo(() => {
    if (!metricsRaw?.by_product) return [];
    return metricsRaw.by_product.map((p: any) => p.product_id).filter(Boolean);
  }, [metricsRaw]);

  const { data: productTitles } = useQuery({
    queryKey: ["m1-product-titles", productIds],
    queryFn: async () => {
      if (!productIds.length) return {};
      const { data } = await (supabase.from("merchant_marketing_products") as any)
        .select("id, title")
        .in("id", productIds);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.title; });
      return map;
    },
    enabled: productIds.length > 0,
    staleTime: 300_000,
  });

  // ── Billing Extract (uses merchant_store_id) ──
  const {
    data: extractRaw,
    isLoading: loadingExtract,
    refetch: refetchExtract,
  } = useQuery({
    queryKey: ["m1-extract", merchantStoreId, period, extractPage],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("m1_get_billing_extract", {
        p_merchant_store_id: merchantStoreId,
        p_from: from,
        p_to: to,
        p_limit: 20,
        p_offset: extractPage * 20,
      });
      if (error) throw error;
      return data as { entries: M1BillingEntry[]; total_count: number; total_charged_cents: number };
    },
    enabled: !!merchantStoreId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // ── Enriched product breakdown ──
  const metrics: M1Metrics = useMemo(() => {
    if (!metricsRaw) return EMPTY_METRICS;
    return {
      ...EMPTY_METRICS,
      ...metricsRaw,
      by_product: (metricsRaw.by_product || []).map((p: any) => ({
        ...p,
        product_title: productTitles?.[p.product_id] || `Produto ${(p.product_id || "").slice(0, 8)}`,
      })),
    };
  }, [metricsRaw, productTitles]);

  const extract = useMemo(() => {
    return {
      entries: extractRaw?.entries || [],
      totalCount: extractRaw?.total_count || 0,
      totalChargedCents: extractRaw?.total_charged_cents || 0,
    };
  }, [extractRaw]);

  return {
    metrics,
    extract,
    period,
    setPeriod,
    extractPage,
    setExtractPage,
    isLoading: loadingMetrics,
    loadingExtract,
    refetchAll: () => { refetchMetrics(); refetchExtract(); },
  };
}
