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

export function useAdvertiserSummary(advertiserId?: string | null, profileType?: string, storeData?: any) {
    const effectiveId = advertiserId || storeData?.id || storeData?.store_id || storeData?.profile_id || null;

    return useQuery({
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
                    categoria: storeData.categoria || resolvedProfileType,
                    appearance: storeData.appearance || null
                };
                targetId = storeData.id || effectiveId;
                ownerUserId = storeData.user_id || storeData.owner_user_id || null;
            } else if (effectiveId) {
                // 2. Tentar buscar em merchant_stores pelo id da loja ou pelo user_id
                //    do dono (a tabela NÃO tem profile_id — a versão antiga com
                //    or(profile_id) devolvia 400 do PostgREST e a loja nunca resolvia).
                //    Status no banco real usa vocabulário misto: "active" e "Ativa".
                const { data: mStore } = await supabase
                    .from("merchant_stores")
                    .select("*")
                    .or(`id.eq.${effectiveId},user_id.eq.${effectiveId}`)
                    .in("status", ["active", "Ativa"])
                    .maybeSingle();

                if (mStore) {
                    const ms = mStore as any;
                    store = {
                        store_name: ms.store_name || ms.nome_loja,
                        city: ms.city || ms.cidade || null,
                        region: ms.region || ms.estado || null,
                        bairro: ms.bairro || ms.neighborhood || null,
                        logradouro: ms.street || null,
                        numero: ms.number || null,
                        cep: ms.cep || null,
                        logo_url: ms.logo_url || null,
                        banner_url: null,
                        description: ms.descricao || null,
                        categoria: resolvedProfileType || "merchant",
                        appearance: ms.appearance || null
                    };
                    targetId = ms.id;
                    ownerUserId = ms.user_id || null;
                } else {
                    // 3. Buscar em profiles + advertiser_accounts
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", effectiveId)
                        .maybeSingle();

                    // advertiser_accounts também não tem profile_id — a chave é user_id.
                    const { data: advAcc } = await supabase
                        .from("advertiser_accounts")
                        .select("*")
                        .eq("user_id", effectiveId)
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
                            categoria: resolvedProfileType || "general",
                            appearance: (advAcc as any)?.appearance || (profile as any)?.appearance || null
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
                        appearance: mp.appearance || store?.appearance || null,
                    } as StoreInfo;
                    targetId = targetId || mp.user_id;
                }
            }

            if (!store) return null;

            // Contar anúncios vivos em todos os módulos para esse targetId.
            // Fonte: VIEWS PÚBLICAS (public_*_listings) — já encapsulam o status
            // "vivo" de cada módulo (os enums diferem: 'active' × 'published') e
            // são legíveis por anon. products só tem store_id (sem status).
            // travel: a view pública não expõe o dono (privacidade); a tabela só
            // é legível autenticado — consulta condicionada à sessão.
            let totalCount = 0;
            try {
                const owner = ownerUserId || targetId;
                const queries = [
                    supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", targetId),
                    supabase.from("public_real_estate_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", owner),
                    supabase.from("public_vehicle_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", owner),
                    supabase.from("public_service_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", owner),
                    supabase.from("public_freight_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", owner),
                    supabase.from("auction_listings").select("id", { count: "exact", head: true }).eq("store_id", targetId).eq("status", "active"),
                ];
                const { data: sessData } = await supabase.auth.getSession();
                if (sessData?.session) {
                    queries.push(
                        supabase.from("travel_listings" as any).select("id", { count: "exact", head: true }).eq("owner_user_id", owner).eq("visibility_status", "published"),
                    );
                }
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
}

export function AdvertiserSummaryCard({ advertiserId, profileType, storeData, compact = true }: AdvertiserSummaryCardProps) {
    const { data: resolvedInfo, isLoading } = useAdvertiserSummary(advertiserId, profileType, storeData);

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
