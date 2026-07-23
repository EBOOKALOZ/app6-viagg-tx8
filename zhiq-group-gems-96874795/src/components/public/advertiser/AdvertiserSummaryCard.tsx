import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StoreHeader, StoreInfo } from "@/components/public/store/StoreHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { moduleKeyFromProfileType, BUSINESS_MODULES } from "@/lib/business-modules";

export interface AdvertiserSummaryCardProps {
    advertiserId?: string | null;
    profileType?: 'merchant' | 'imoveis' | 'veiculos' | 'servicos' | 'freteiro' | 'viagem' | 'leiloes' | 'general' | string;
    storeData?: any;
    compact?: boolean;
}

export function AdvertiserSummaryCard({ advertiserId, profileType, storeData, compact = true }: AdvertiserSummaryCardProps) {
    const effectiveId = advertiserId || storeData?.id || storeData?.store_id || storeData?.profile_id || null;

    const { data: resolvedInfo, isLoading } = useQuery({
        queryKey: ["advertiser-summary-info", effectiveId, profileType],
        queryFn: async () => {
            if (!effectiveId && !storeData) return null;

            let store: StoreInfo | null = null;
            let targetId = effectiveId;
            let resolvedProfileType = profileType;
            let ownerUserId: string | null = null;

            // 1. Se já recebemos storeData estruturado como merchant_store
            if (storeData && storeData.store_name) {
                store = {
                    store_name: storeData.store_name,
                    city: storeData.city || null,
                    region: storeData.region || null,
                    bairro: storeData.bairro || null,
                    logradouro: storeData.logradouro || null,
                    numero: storeData.numero || null,
                    cep: storeData.cep || null,
                    logo_url: storeData.logo_url || null,
                    banner_url: storeData.banner_url || null,
                    description: storeData.description || null,
                    categoria: storeData.categoria || resolvedProfileType
                };
                targetId = storeData.id || effectiveId;
                ownerUserId = storeData.user_id || storeData.owner_user_id || null;
            } else if (effectiveId) {
                // 2. Tentar buscar em merchant_stores primeiro pelo id ou profile_id
                const { data: mStore } = await supabase
                    .from("merchant_stores")
                    .select("*")
                    .or(`id.eq.${effectiveId},profile_id.eq.${effectiveId}`)
                    .eq("status", "active")
                    .maybeSingle();

                if (mStore) {
                    store = {
                        store_name: mStore.store_name,
                        city: mStore.city || null,
                        region: mStore.region || null,
                        bairro: (mStore as any).bairro || null,
                        logradouro: (mStore as any).logradouro || null,
                        numero: (mStore as any).numero || null,
                        cep: (mStore as any).cep || null,
                        logo_url: mStore.logo_url || null,
                        banner_url: mStore.banner_url || null,
                        description: mStore.description || null,
                        categoria: mStore.categoria || resolvedProfileType || "merchant"
                    };
                    targetId = mStore.id;
                    ownerUserId = (mStore as any).user_id || null;
                } else {
                    // 3. Buscar em profiles + advertiser_accounts
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", effectiveId)
                        .maybeSingle();

                    const { data: advAcc } = await supabase
                        .from("advertiser_accounts")
                        .select("*")
                        .eq("profile_id", effectiveId)
                        .maybeSingle();

                    if (profile || advAcc) {
                        const name = (advAcc as any)?.company_name || (profile as any)?.nome || (profile as any)?.full_name || (profile as any)?.email?.split("@")[0] || "Anunciante Verificado";
                        store = {
                            store_name: name,
                            city: (advAcc as any)?.city || (profile as any)?.cidade || null,
                            region: (advAcc as any)?.state || (profile as any)?.estado || null,
                            bairro: (advAcc as any)?.neighborhood || (profile as any)?.bairro || null,
                            logradouro: (advAcc as any)?.address || (profile as any)?.endereco || null,
                            numero: (advAcc as any)?.number || (profile as any)?.numero || null,
                            cep: (advAcc as any)?.zip_code || (profile as any)?.cep || null,
                            logo_url: (advAcc as any)?.company_logo_url || (profile as any)?.avatar_url || null,
                            banner_url: (advAcc as any)?.company_banner_url || null,
                            description: (advAcc as any)?.company_description || (profile as any)?.bio || "Anunciante parceiro da plataforma Viagg-TX8.",
                            categoria: resolvedProfileType || "general"
                        };
                        targetId = (profile as any)?.id || effectiveId;
                        ownerUserId = (profile as any)?.id || (advAcc as any)?.user_id || null;
                    }
                }
            }

            // Identidade do MÓDULO ("Minha Imobiliária"/"Minha Revenda"/"Minha
            // Empresa"/"Minha Agência"/"Meus Leilões"): se o dono configurou o
            // perfil deste módulo, ela SUBSTITUI a identidade genérica no card
            // (separação total — não herda logo/banner/nome da loja do lojista).
            // Tenta pelo ownerUserId resolvido e também pelo próprio effectiveId
            // (listings guardam owner_user_id — pode não existir loja/perfil).
            const moduleKey = moduleKeyFromProfileType(resolvedProfileType);
            if (moduleKey) {
                let mp: any = null;
                const candidates = [ownerUserId, effectiveId].filter(
                    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
                );
                for (const cand of candidates) {
                    const { data } = await (supabase.from("advertiser_module_profiles") as any)
                        .select("*")
                        .eq("user_id", cand)
                        .eq("module_key", moduleKey)
                        .maybeSingle();
                    if (data) { mp = data; break; }
                }
                if (mp) {
                    store = {
                        ...(store || {}),
                        store_name: mp.display_name || BUSINESS_MODULES[moduleKey].noun,
                        logo_url: mp.logo_url || null,
                        banner_url: mp.banner_url || null,
                        description: mp.description || null,
                        city: mp.city || store?.city || null,
                        region: mp.state || store?.region || null,
                        categoria: resolvedProfileType || "general",
                    } as StoreInfo;
                    targetId = targetId || mp.user_id;
                }
            }

            if (!store) return null;

            // Contar todos os anúncios ativos em todos os módulos para esse targetId/profile_id
            let totalCount = 0;
            try {
                const queries = [
                    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", targetId).eq("status", "active"),
                    supabase.from("real_estate_listings").select("id", { count: "exact", head: true }).or(`store_id.eq.${targetId},profile_id.eq.${targetId}`).eq("status", "active"),
                    supabase.from("vehicle_listings").select("id", { count: "exact", head: true }).or(`store_id.eq.${targetId},profile_id.eq.${targetId}`).eq("status", "active"),
                    supabase.from("service_listings").select("id", { count: "exact", head: true }).or(`store_id.eq.${targetId},profile_id.eq.${targetId}`).eq("status", "active"),
                    supabase.from("freight_listings").select("id", { count: "exact", head: true }).or(`store_id.eq.${targetId},profile_id.eq.${targetId}`).eq("status", "active"),
                    supabase.from("travel_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", ownerUserId || targetId).eq("visibility_status", "published"),
                ];
                const results = await Promise.all(queries);
                results.forEach((res) => {
                    if (res.count) totalCount += res.count;
                });
            } catch (e) {
                console.error("Erro ao contar anúncios:", e);
            }

            return {
                store,
                targetId,
                totalCount,
                type: resolvedProfileType || store.categoria || "general"
            };
        },
        enabled: Boolean(effectiveId || storeData),
        staleTime: 1000 * 60 * 5 // 5 minutos de cache
    });

    if (isLoading && !resolvedInfo) {
        return (
            <div className="w-full my-4">
                <Skeleton className="w-full h-40 lg:h-48 rounded-3xl lg:rounded-[40px]" />
            </div>
        );
    }

    if (!resolvedInfo || !resolvedInfo.store) {
        return null;
    }

    return (
        <div className="w-full">
            <StoreHeader
                store={resolvedInfo.store}
                productsCount={resolvedInfo.totalCount}
                profileType={resolvedInfo.type}
                showProfileButton={true}
                profileId={resolvedInfo.targetId}
                compact={compact}
            />
        </div>
    );
}

export default AdvertiserSummaryCard;
