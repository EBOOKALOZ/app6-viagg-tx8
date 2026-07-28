import { useState, useMemo, useRef } from "react";
import { Outlet, useParams, useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Store, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { StoreHeader } from "@/components/public/store/StoreHeader";
import { StoreThemeScope } from "@/components/public/store/StoreThemeScope";
import { sanitizeAppearance } from "@/lib/store-theme";
import { moduleKeyFromPublicContext, BUSINESS_MODULES } from "@/lib/business-modules";
import { useStorePaymentSettings } from "@/hooks/useStorePaymentSettings";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";

function normalizeImageUrl(url: string | null | undefined, bucket: string = 'marketing-materials'): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) {
        return supabase.storage.from(bucket).getPublicUrl(trimmed).data.publicUrl;
    }
    return trimmed;
}

export function StoreLayout() {
    const { storeId } = useParams<{ storeId: string }>();
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    
    // UI State for MarketLayout
    const [search, setSearch] = useState("");

    const { settings: paySettings } = useStorePaymentSettings(storeId);

    const { data: store, isLoading: loadingStore } = useQuery({
        queryKey: ["public-store-info", storeId],
        queryFn: async () => {
            if (!storeId) return null;
            
            let data: any = null;
            
            // 1. Tentar buscar direto como merchant_store ID
            const { data: storeData } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("id", storeId)
                .maybeSingle();

            data = storeData;

            if (!data) {
                // 2. Se não encontrou, talvez o storeId seja um advertiser_account_id
                const { data: advData } = await supabase.from("advertiser_accounts").select("user_id").eq("id", storeId).maybeSingle();
                const targetUserId = advData?.user_id || storeId; // Se não for adv, testamos se o próprio ID é o user_id

                if (targetUserId) {
                    const { data: realStore } = await supabase.from("merchant_stores")
                        .select("*")
                        .eq("user_id", targetUserId)
                        .order("created_at", { ascending: true })
                        .limit(1)
                        .maybeSingle();
                    if (realStore) {
                        data = realStore;
                    } else {
                        // 3. Fallback final: cria um mock persistindo o user_id para puxar o profile
                        data = { id: storeId, user_id: targetUserId };
                    }
                }
            }

            if (!data) return null;

            let profile = null;
            if (data.user_id) {
                const { data: pData } = await supabase.from("profiles").select("*").eq("id", data.user_id).single();
                if (pData) profile = pData;
            }

            return {
                ...data,
                store_name: data.nome_loja || profile?.nome_loja || profile?.full_name || profile?.name || data.store_name || "Vendedor Local",
                logo_url: data.logo_url || profile?.logo_url,
                city: data.cidade || profile?.cidade || data.city,
                region: data.estado || profile?.estado || data.region,
                bairro: data.bairro || data.neighborhood || profile?.bairro,
                logradouro: data.rua || data.street || profile?.rua || data.endereco || profile?.endereco || data.logradouro,
                description: data.descricao || profile?.descricao || data.description,
                whatsapp: data.whatsapp || profile?.whatsapp || data.telefone || profile?.telefone
            };
        },
        enabled: !!storeId,
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

    const initialTabRef = useRef<string | null>(searchParams.get("tab"));
    const publicModuleKey = useMemo(
        () => moduleKeyFromPublicContext(pathname, initialTabRef.current),
        [pathname],
    );

    const { data: moduleProfile } = useQuery({
        queryKey: ["business-module-profile", publicModuleKey, store?.user_id],
        enabled: !!publicModuleKey && !!store?.user_id,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            const { data } = await (supabase.from("advertiser_module_profiles") as any)
                .select("*")
                .eq("user_id", store!.user_id)
                .eq("module_key", publicModuleKey!)
                .maybeSingle();
            return data ?? null;
        },
    });

    if (loadingStore) {
        return (
            <MarketLayout>
                <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-[#FF6A00]" />
                    <p className="text-sm font-black text-zinc-400 uppercase tracking-widest animate-pulse">Carregando Loja...</p>
                </div>
            </MarketLayout>
        );
    }

    if (!store) {
        return (
            <MarketLayout>
                <div className="container py-32 text-center space-y-6">
                    <Store className="w-20 h-20 text-zinc-200 mx-auto" />
                    <h1 className="text-3xl font-black text-zinc-900 uppercase">Loja não encontrada</h1>
                    <Button onClick={() => window.location.href = "/mercado"} className="bg-zinc-900 text-white rounded-2xl h-14 px-10 font-black uppercase text-xs tracking-widest gap-2">
                        <ArrowLeft className="w-4 h-4" /> Voltar ao Mercado
                    </Button>
                </div>
            </MarketLayout>
        );
    }

    const displayStore = {
        ...store,
        store_name: moduleProfile?.store_name || store.store_name,
        logo_url: moduleProfile?.logo_url || store.logo_url,
        banner_url: moduleProfile?.banner_url || store.banner_url,
        description: moduleProfile?.description || store.description,
    };

    const appearance = sanitizeAppearance(moduleProfile?.appearance || store.appearance);

    const outletContext = {
        isStoreContext: true,
        search,
        setSearch,
        store,
        displayStore,
        moduleProfile,
        publicModuleKey,
        paySettings,
        appearance
    };

    return (
        <MarketLayout
            search={search}
            setSearch={setSearch}
            mainClassName={appearance ? "flex flex-col" : "bg-institutional-yellow flex flex-col"}
            blueFooter
            blueFooterLabel={`${publicModuleKey ? BUSINESS_MODULES[publicModuleKey].noun : "Loja"}: ${displayStore.store_name}`}
            headerChildren={<MarketNavButtons />}
        >
            <StoreThemeScope appearance={appearance}>
                <div className="min-h-screen pb-24">
                    <StoreHeader
                        store={displayStore}
                        profileType={publicModuleKey ? BUSINESS_MODULES[publicModuleKey].profileType : (store.categoria || "general")}
                        productsCount={0} // We might pass a prop or fetch this separately if critical
                        whatsappNumber={publicModuleKey ? ((moduleProfile as any)?.whatsapp || null) : (paySettings?.store_whatsapp || null)}
                        onShare={() => {
                            const url = window.location.href;
                            navigator.share?.({ title: displayStore.store_name, url }).catch(() => {});
                        }}
                        logoUrl={normalizeImageUrl(displayStore.logo_url, 'logos_lojas')}
                        bannerUrl={normalizeImageUrl(displayStore.banner_url)}
                    />
                    
                    <Outlet context={outletContext} />
                </div>
            </StoreThemeScope>
        </MarketLayout>
    );
}
