import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminDashboardSnapshot {
    stores: {
        total_stores: number;
        active_stores: number;
        stores_with_products: number;
        active_recently_stores: number;
        growth_new_stores_pct: number;
    };
    products: {
        total_products: number;
        new_products: number;
        used_products: number;
        avg_products_per_store: number;
        growth_products_pct: number;
        growth_new_pct: number;
        growth_used_pct: number;
    };
    listings: {
        total_auctions: number;
        active_auctions: number;
        total_arremates: number;
        active_arremates: number;
        growth_auctions_pct: number;
        growth_arremates_pct: number;
    };
    credits: {
        total_purchases: number;
        total_value: number;
        period_purchases: number;
        period_value: number;
        growth_purchases_pct: number;
        growth_value_pct: number;
        top_packages: Array<{ package_name: string; count: number; total_value: number }>;
        top_buying_stores: Array<{ store_name: string; total_purchases: number; total_spent: number }>;
        top_credit_usage_categories: Array<{ category: string; usage_count: number }>;
    };
    market_intelligence: {
        top_search_terms: Array<{ term: string; count: number }>;
        top_visited_stores: Array<{ store_name: string; visit_count: number }>;
        top_viewed_products: Array<{ product_name: string; view_count: number }>;
        top_categories: Array<{ category: string; access_count: number }>;
    };
    profit: {
        total_gross: number;
        total_net: number;
        commission_revenue: number;
        credits_revenue: number;
        growth_gross_pct: number;
        growth_net_pct: number;
        margin_pct: number;
        other_revenue: number;
    };
}

export function useAdminDashboardSnapshot(from: string, to: string, options?: { enabled?: boolean }) {
    return useQuery<AdminDashboardSnapshot>({
        queryKey: ["admin-dashboard-snapshot", from, to],
        queryFn: async () => {
            console.log("[useAdminDashboardSnapshot] Calling RPC with range:", { from, to });
            
            const { data, error } = await supabase.rpc("admin_get_dashboard_snapshot_rpc", {
                p_from: from,
                p_to: to
            });

            if (error) {
                console.error("[useAdminDashboardSnapshot] RPC Error:", error);
                // Assigning additional fields to the error object directly for compatibility
                const richError = new Error(error.message || "Unknown RPC error");
                (richError as any).details = error.details;
                (richError as any).hint = error.hint;
                (richError as any).code = error.code;
                throw richError;
            }

            if (!data) {
                console.warn("[useAdminDashboardSnapshot] RPC returned no data");
                throw new Error("Nenhum dado retornado pela RPC.");
            }

            return data as AdminDashboardSnapshot;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        enabled: options?.enabled !== false,
    });
}
