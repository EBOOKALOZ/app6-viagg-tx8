import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FunnelMetrics {
  // Totais brutos
  total_product_views: number;
  total_store_entries: number;
  total_in_store_clicks: number;
  total_buy_clicks: number;
  total_orders_finished: number;
  total_product_questions: number;
  // Taxas de conversão
  view_to_store_rate: number;
  store_to_product_rate: number;
  product_to_buy_rate: number;
  buy_to_order_rate: number;
  overall_conversion_rate: number;
}

export interface FunnelDaily {
  funnel_date: string;
  product_views: number;
  store_entries: number;
  in_store_product_clicks: number;
  buy_clicks: number;
  orders_finished: number;
  product_questions: number;
}

export interface FunnelByStore {
  store_id: string;
  store_name: string;
  city: string;
  state: string;
  store_views_count: number;
  product_clicks_count: number;
  buy_clicks_count: number;
  orders_count: number;
  questions_count: number;
  store_view_to_product_rate: number;
  product_to_buy_rate: number;
  buy_to_order_rate: number;
}

export interface FunnelByProduct {
  product_id: string;
  product_name: string;
  city: string;
  state: string;
  product_views: number;
  buy_clicks: number;
  orders_finished: number;
  questions_count: number;
  view_to_buy_rate: number;
  buy_to_order_rate: number;
}

export interface FunnelByCategory {
  category_id: string;
  category_name: string;
  product_views: number;
  buy_clicks: number;
  orders_finished: number;
  questions_count: number;
  view_to_buy_rate: number;
}

export interface FunnelHourly {
  hour_of_day: number;
  event_type: string;
  event_count: number;
  unique_users: number;
  unique_sessions: number;
}

export interface ProductQuestion {
  product_id: string;
  product_name: string;
  total_questions: number;
  questions_unlocked: number;
  questions_converted: number;
  question_to_sale_rate: number;
  last_question_at: string | null;
}

export interface ConversionGap {
  entity_type: 'product' | 'store' | 'category';
  entity_id: string;
  entity_name: string;
  gap_type: string;
  product_views?: number;
  buy_clicks?: number;
  orders_finished?: number;
  drop_percent: number;
}

export function useConversionFunnel() {
  // Summary (totais e taxas)
  const summary = useQuery<FunnelMetrics>({
    queryKey: ["funnel-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_conversion_funnel_summary")
        .select("*")
        .maybeSingle();
      if (error) {
        console.warn("v_conversion_funnel_summary not ready:", error.message);
        return {
          total_product_views: 0,
          total_store_entries: 0,
          total_in_store_clicks: 0,
          total_buy_clicks: 0,
          total_orders_finished: 0,
          total_product_questions: 0,
          view_to_store_rate: 0,
          store_to_product_rate: 0,
          product_to_buy_rate: 0,
          buy_to_order_rate: 0,
          overall_conversion_rate: 0,
        };
      }
      return data as FunnelMetrics;
    },
    refetchInterval: 60_000,
  });

  // Daily trends
  const daily = useQuery<FunnelDaily[]>({
    queryKey: ["funnel-daily"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_conversion_funnel_daily")
        .select("*")
        .order("funnel_date", { ascending: false })
        .limit(30);
      if (error) {
        console.warn("v_conversion_funnel_daily not ready:", error.message);
        return [];
      }
      return data as FunnelDaily[];
    },
    refetchInterval: 60_000,
  });

  // By store
  const byStore = useQuery<FunnelByStore[]>({
    queryKey: ["funnel-by-store"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_funnel_by_store")
        .select("*")
        .order("store_views_count", { ascending: false });
      if (error) {
        console.warn("v_funnel_by_store not ready:", error.message);
        return [];
      }
      return data as FunnelByStore[];
    },
    refetchInterval: 60_000,
  });

  // By product
  const byProduct = useQuery<FunnelByProduct[]>({
    queryKey: ["funnel-by-product"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_funnel_by_product")
        .select("*")
        .order("product_views", { ascending: false });
      if (error) {
        console.warn("v_funnel_by_product not ready:", error.message);
        return [];
      }
      return data as FunnelByProduct[];
    },
    refetchInterval: 60_000,
  });

  // By category
  const byCategory = useQuery<FunnelByCategory[]>({
    queryKey: ["funnel-by-category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_funnel_by_category")
        .select("*")
        .order("product_views", { ascending: false });
      if (error) {
        console.warn("v_funnel_by_category not ready:", error.message);
        return [];
      }
      return data as FunnelByCategory[];
    },
    refetchInterval: 60_000,
  });

  // Hourly distribution
  const hourly = useQuery<FunnelHourly[]>({
    queryKey: ["funnel-hourly"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_funnel_hourly")
        .select("*")
        .order("hour_of_day");
      if (error) {
        console.warn("v_funnel_hourly not ready:", error.message);
        return [];
      }
      return data as FunnelHourly[];
    },
    refetchInterval: 60_000,
  });

  // Product questions analysis
  const productQuestions = useQuery<ProductQuestion[]>({
    queryKey: ["product-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_product_questions_analytics")
        .select("*")
        .order("total_questions", { ascending: false })
        .limit(50);
      if (error) {
        console.warn("v_product_questions_analytics not ready:", error.message);
        return [];
      }
      return data as ProductQuestion[];
    },
    refetchInterval: 60_000,
  });

  // Conversion gaps (insights)
  const gaps = useQuery<ConversionGap[]>({
    queryKey: ["conversion-gaps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_conversion_gaps")
        .select("*")
        .order("drop_percent", { ascending: false })
        .limit(20);
      if (error) {
        console.warn("v_conversion_gaps not ready:", error.message);
        return [];
      }
      return data as ConversionGap[];
    },
    refetchInterval: 60_000,
  });

  // Loading state
  const isLoading = summary.isLoading || daily.isLoading || byStore.isLoading;

  return {
    summary: summary.data || null,
    daily: daily.data || [],
    byStore: byStore.data || [],
    byProduct: byProduct.data || [],
    byCategory: byCategory.data || [],
    hourly: hourly.data || [],
    productQuestions: productQuestions.data || [],
    gaps: gaps.data || [],
    isLoading,
    refetchAll: () => {
      summary.refetch();
      daily.refetch();
      byStore.refetch();
      byProduct.refetch();
      byCategory.refetch();
      hourly.refetch();
      productQuestions.refetch();
      gaps.refetch();
    },
  };
}
