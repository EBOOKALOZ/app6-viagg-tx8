import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

function isActiveStatus(status: string | null): boolean {
    if (!status) return true; // null/undefined = ativo
    const s = status.toLowerCase().trim();
    return s === "ativo" || s === "active";
}

export interface AdminStore {
    id: string;
    store_name: string | null;
    user_id: string | null;
    owner_name: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    city: string | null;
    bairro: string | null;
    state: string | null;
    status: string | null;
    created_at: string | null;
    category: string | null;
    cnpj: string | null;
    logo_url: string | null;
    product_count: number;
    m1_event_count: number;
    m1_total_charged: number;
}

export function useAdminStores() {
    const { data: stores = [], isLoading, error } = useQuery<AdminStore[]>({
        queryKey: ["admin-stores-full"],
        queryFn: async () => {
            // 1. Fetch all merchant_stores
            const { data: rawStores, error: storesErr } = await (supabase.from("merchant_stores") as unknown)
                .select("*")
                .order("created_at", { ascending: false });

            if (storesErr) { console.error("[AdminStores] stores error:", storesErr); return []; }
            if (!rawStores || rawStores.length === 0) return [];

            // 2. Fetch profiles for owner info
            const userIds = [...new Set(rawStores.map((s: unknown) => s.user_id).filter(Boolean))] as string[];
            const profilesMap: Record<string, unknown> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await (supabase.from("profiles") as unknown)
                    .select("id, nome_loja, name, email, telefone, whatsapp, logo_url, cidade, estado, bairro, categoria, cpf_cnpj")
                    .in("id", userIds);
                if (profiles) {
                    profiles.forEach((p: unknown) => { profilesMap[p.id] = p; });
                }
            }

            // 3. Fetch product counts per store
            const storeIds = rawStores.map((s: unknown) => s.id);
            const productCountMap: Record<string, number> = {};
            if (storeIds.length > 0) {
                const { data: products } = await (supabase.from("merchant_marketing_products") as unknown)
                    .select("merchant_store_id")
                    .in("merchant_store_id", storeIds);
                if (products) {
                    products.forEach((p: unknown) => {
                        productCountMap[p.merchant_store_id] = (productCountMap[p.merchant_store_id] || 0) + 1;
                    });
                }
            }

            // 4. Fetch M1 event counts per store
            const m1EventMap: Record<string, number> = {};
            const m1ChargedMap: Record<string, number> = {};
            try {
                const { data: m1Events } = await (supabase.from("m1_billing_events") as unknown)
                    .select("merchant_store_id, charged_value")
                    .in("merchant_store_id", storeIds);
                if (m1Events) {
                    m1Events.forEach((e: unknown) => {
                        m1EventMap[e.merchant_store_id] = (m1EventMap[e.merchant_store_id] || 0) + 1;
                        m1ChargedMap[e.merchant_store_id] = (m1ChargedMap[e.merchant_store_id] || 0) + (e.charged_value || 0);
                    });
                }
            } catch {
                // m1_billing_events may not exist yet
            }

            // 5. Enrich stores
            const enriched = rawStores.map((s: unknown) => {
                const profile = profilesMap[s.user_id] || {};
                return {
                    id: s.id,
                    store_name: s.store_name || s.nome_loja || profile.nome_loja || null,
                    user_id: s.user_id || null,
                    owner_name: profile.name || null,
                    email: s.email || profile.email || null,
                    phone: s.phone || s.whatsapp || profile.telefone || profile.whatsapp || null,
                    whatsapp: s.whatsapp || profile.whatsapp || null,
                    city: s.city || s.cidade || profile.cidade || null,
                    bairro: s.bairro || profile.bairro || null,
                    state: s.region || s.estado || profile.estado || null,
                    status: s.status || "ativo",
                    created_at: s.created_at || null,
                    category: s.categoria || profile.categoria || null,
                    cnpj: s.cnpj || profile.cpf_cnpj || null,
                    logo_url: s.logo_url || profile.logo_url || null,
                    product_count: productCountMap[s.id] || 0,
                    m1_event_count: m1EventMap[s.id] || 0,
                    m1_total_charged: m1ChargedMap[s.id] || 0,
                } as AdminStore;
            });

            // 6. Fallback: fetch auth emails via RPC for stores still missing email
            const missingEmailUserIds = enriched
                .filter(s => !s.email && s.user_id)
                .map(s => s.user_id as string);

            if (missingEmailUserIds.length > 0) {
                try {
                    const { data: authEmails } = await supabase.rpc("admin_get_auth_emails", {
                        p_user_ids: missingEmailUserIds,
                    });
                    if (authEmails && Array.isArray(authEmails)) {
                        const authEmailMap: Record<string, string> = {};
                        authEmails.forEach((e: unknown) => {
                            if (e.auth_email) authEmailMap[e.user_id] = e.auth_email;
                        });
                        enriched.forEach(s => {
                            if (!s.email && s.user_id && authEmailMap[s.user_id]) {
                                s.email = authEmailMap[s.user_id];
                            }
                        });
                    }
                } catch {
                    // RPC may not exist yet — silently continue
                }
            }

            return enriched;
        },
        staleTime: 30_000,
    });

    // KPI summaries
    const kpis = useMemo(() => {
        const total = stores.length;
        const active = stores.filter(s => isActiveStatus(s.status)).length;
        const inactive = total - active;
        const withProducts = stores.filter(s => s.product_count > 0).length;
        const withoutProducts = total - withProducts;
        const withM1 = stores.filter(s => s.m1_event_count > 0).length;
        return { total, active, inactive, withProducts, withoutProducts, withM1 };
    }, [stores]);

    // Unique cities
    const cities = useMemo(() => {
        const set = new Set<string>();
        stores.forEach(s => { if (s.city) set.add(s.city); });
        return [...set].sort();
    }, [stores]);

    // Unique bairros
    const bairros = useMemo(() => {
        const set = new Set<string>();
        stores.forEach(s => { if (s.bairro) set.add(s.bairro); });
        return [...set].sort();
    }, [stores]);

    return { stores, isLoading, error, kpis, cities, bairros };
}
