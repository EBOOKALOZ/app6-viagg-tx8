import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════
export interface Store360Row {
    store_id: string;
    store_name: string | null;
    user_id: string | null;
    status: string | null;
    created_at: string | null;
    city: string | null;
    state: string | null;
    bairro: string | null;
    store_email: string | null;
    store_phone: string | null;
    whatsapp: string | null;
    logo_url: string | null;
    category: string | null;
    cnpj: string | null;
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    product_count: number;
    active_product_count: number;
    intention_count: number;
    order_count: number;
    intention_total: number;
    order_total: number;
    last_intention_at: string | null;
    credit_balance: number;
    credits_earned: number;
    credits_spent: number;
    m1_event_count: number;
    m1_total_charged: number;
    auction_count: number;
    active_auction_count: number;
    arremate_count: number;
    active_arremate_count: number;
    delivery_count: number;
    profile_count: number;
    profile_types: string[];
    activity_badge: "quente" | "ativa" | "morna" | "fria" | "sem_movimento";
    days_since_last_activity: number | null;
    upgrade_signal: boolean;
    churn_signal: boolean;
    subscription_ready: boolean;
    traffic_no_conversion: boolean;
    new_no_activation: boolean;
    multi_profile_strategic: boolean;
    estimated_revenue: number;
}

export interface Store360Detail {
    store: Store360Row;
    products: any[];
    intentions: any[];
    credits: any[];
    auctions: any[];
    arremates: any[];
    account: Account360Row | null;
}

export interface Account360Row {
    user_id: string;
    user_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string | null;
    store_count: number;
    store_ids: string[];
    store_names: string[];
    profile_count: number;
    profile_types: string[];
    is_multi_profile: boolean;
}

export interface StoreListFilters {
    search?: string;
    city?: string;
    status?: string;
    activity?: string;
    upgrade?: boolean | null;
    churn?: boolean | null;
    multiProfile?: boolean | null;
    hasAuction?: boolean | null;
    hasArremate?: boolean | null;
}

export interface StoreListKpis {
    total: number;
    active: number;
    upgradeReady: number;
    churnRisk: number;
    totalRevenue: number;
    multiProfile: number;
    subscriptionReady: number;
    trafficNoConversion: number;
    newNoActivation: number;
}

// ═══════════════════════════════════════
// Hook: useStoreList360
// ═══════════════════════════════════════
export function useStoreList360(filters: StoreListFilters = {}) {
    const { data: stores = [], isLoading, error } = useQuery<Store360Row[]>({
        queryKey: ["admineng-stores-360", filters],
        queryFn: async () => {
            const params: Record<string, any> = {};
            if (filters.search) params.p_search = filters.search;
            if (filters.city) params.p_city = filters.city;
            if (filters.status) params.p_status = filters.status;
            if (filters.activity) params.p_activity = filters.activity;
            if (filters.upgrade !== undefined && filters.upgrade !== null) params.p_upgrade = filters.upgrade;
            if (filters.churn !== undefined && filters.churn !== null) params.p_churn = filters.churn;
            if (filters.multiProfile !== undefined && filters.multiProfile !== null) params.p_multi_profile = filters.multiProfile;
            if (filters.hasAuction !== undefined && filters.hasAuction !== null) params.p_has_auction = filters.hasAuction;
            if (filters.hasArremate !== undefined && filters.hasArremate !== null) params.p_has_arremate = filters.hasArremate;

            const { data, error } = await (supabase.rpc as any)("list_stores_360", params);
            if (error) { console.error("[LOJA5] list_stores_360 error:", error); return []; }
            return (data || []) as Store360Row[];
        },
        staleTime: 30_000,
    });

    const kpis = useMemo<StoreListKpis>(() => {
        const total = stores.length;
        const active = stores.filter(s => s.activity_badge === "quente" || s.activity_badge === "ativa").length;
        const upgradeReady = stores.filter(s => s.upgrade_signal).length;
        const churnRisk = stores.filter(s => s.churn_signal).length;
        const totalRevenue = stores.reduce((sum, s) => sum + (s.estimated_revenue || 0), 0);
        const multiProfile = stores.filter(s => s.multi_profile_strategic).length;
        const subscriptionReady = stores.filter(s => s.subscription_ready).length;
        const trafficNoConversion = stores.filter(s => s.traffic_no_conversion).length;
        const newNoActivation = stores.filter(s => s.new_no_activation).length;
        return { total, active, upgradeReady, churnRisk, totalRevenue, multiProfile, subscriptionReady, trafficNoConversion, newNoActivation };
    }, [stores]);

    const cities = useMemo(() => {
        const set = new Set<string>();
        stores.forEach(s => { if (s.city) set.add(s.city); });
        return [...set].sort();
    }, [stores]);

    return { stores, isLoading, error, kpis, cities };
}

// ═══════════════════════════════════════
// Hook: useStore360
// ═══════════════════════════════════════
export function useStore360(storeId: string | null) {
    return useQuery<Store360Detail | null>({
        queryKey: ["admineng-store-360", storeId],
        queryFn: async () => {
            if (!storeId) return null;
            const { data, error } = await (supabase.rpc as any)("get_store_360_json", { p_store_id: storeId });
            if (error) { console.error("[LOJA5] get_store_360_json error:", error); return null; }
            if (data?.error) { console.error("[LOJA5] store not found:", data.error); return null; }
            return data as Store360Detail;
        },
        enabled: !!storeId,
        staleTime: 20_000,
    });
}

// ═══════════════════════════════════════
// Hook: useAccount360
// ═══════════════════════════════════════
export function useAccount360(userId: string | null) {
    return useQuery<{ account: Account360Row; stores: Store360Row[] } | null>({
        queryKey: ["admineng-account-360", userId],
        queryFn: async () => {
            if (!userId) return null;
            const { data, error } = await (supabase.rpc as any)("get_account_360_json", { p_user_id: userId });
            if (error) { console.error("[LOJA5] get_account_360_json error:", error); return null; }
            if (data?.error) { console.error("[LOJA5] account not found:", data.error); return null; }
            return data as { account: Account360Row; stores: Store360Row[] };
        },
        enabled: !!userId,
        staleTime: 20_000,
    });
}
