import { useMemo, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
    Store, Search, ShoppingBag, Loader2, ArrowLeft, 
    ShoppingCart, Phone, ShieldCheck, Flame, LayoutGrid, Sparkles
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trackM1Event } from "@/skills/growth/trackM1Event";
import { useStoreCart } from "@/hooks/useStoreCart";
import { StoreCartDrawer } from "@/components/public/StoreCartDrawer";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { useStorePaymentSettings } from "@/hooks/useStorePaymentSettings";
import { useMarketplaceTracking } from "@/hooks/analytics/useMarketplaceTracking";
import { cn, parseBRLCurrency } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { resolveTravelMediaRow } from "@/lib/viagem/travelMedia";
import { resolveProductById } from "@/services/resolveProduct";

import { StoreHeader } from "@/components/public/store/StoreHeader";
import { StorePremiumCard, StoreProduct } from "@/components/public/store/StorePremiumCard";
import { ProductInquiryModal } from "@/components/public/ProductInquiryModal";
import DiscountRequestModal from "@/components/public/DiscountRequestModal";
import { consumeMarketplaceProductClick } from "@/lib/credits/consumeMarketplaceProductClick";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { MarketAuctionCard } from "@/components/advertiser/MarketAuctionCard";
import { Gavel } from "lucide-react";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { StoreThemeScope } from "@/components/public/store/StoreThemeScope";
import { sanitizeAppearance } from "@/lib/store-theme";
import { moduleKeyFromPublicContext, BUSINESS_MODULES, publicAdvertiserPath } from "@/lib/business-modules";
import { TravelFullView } from "@/components/travel/TravelFullView";
import {
    Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type TabValue = "home" | "all" | "promo" | "leiloes" | "arremates" | "imoveis" | "veiculos" | "servicos" | "fretes" | "viagens";

// Mapeia o ?tab= da URL (usado pelo novo fluxo card-de-leilão → loja) para a aba.
function tabFromParam(p: string | null): TabValue | null {
    if (p === "leiloes" || p === "leilao" || p === "leilões") return "leiloes";
    if (p === "arremates" || p === "arremate") return "arremates";
    if (p === "imoveis" || p === "imobiliaria") return "imoveis";
    if (p === "veiculos" || p === "revenda") return "veiculos";
    if (p === "servicos" || p === "prestador") return "servicos";
    if (p === "fretes" || p === "mudancas" || p === "freteiro") return "fretes";
    if (p === "viagens" || p === "turismo") return "viagens";
    if (p === "all" || p === "promo" || p === "home") return p as TabValue;
    return null;
}

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

export default function StorePublicPage() {
    const { storeId } = useParams<{ storeId: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { pathname } = useLocation();

    // UI State — aba inicial pode vir de ?tab= (novo fluxo: clicar num card de
    // leilão/arremate abre a loja já na aba correta).
    const [search, setSearch] = useState("");
    const [cartOpen, setCartOpen] = useState(false);
    const [recentlyAdded, setRecentlyAdded] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<TabValue>(() => tabFromParam(searchParams.get("tab")) ?? "home");
    const [activeCategory, setActiveCategory] = useState<string>("all");
    const [inquiryProduct, setInquiryProduct] = useState<StoreProduct | null>(null);
    const [offerProduct, setOfferProduct] = useState<StoreProduct | null>(null);

    // Carrossel "Mais produtos desta loja" (abaixo do produto em destaque)
    const [moreCat, setMoreCat] = useState<string>("all");
    const [moreLimit, setMoreLimit] = useState(12);

    // Produto em DESTAQUE via ?product= (novo fluxo: clicar num produto abre a
    // loja com ele em destaque; trocar de produto NÃO sai da loja). String estável.
    // Aceita ?product= E ?produto= (compatibilidade PT/EN — mesmo comportamento).
    const highlightedProductId = searchParams.get("product") ?? searchParams.get("produto");
    const featuredRef = useRef<HTMLDivElement | null>(null);

    // Fetchers
    const cart = useStoreCart(storeId);
    const globalCart = useGlobalCart();
    const { settings: paySettings } = useStorePaymentSettings(storeId);
    const { trackStoreVisit, trackProductVisit } = useMarketplaceTracking();

    const { data: store, isLoading: loadingStore } = useQuery({
        queryKey: ["public-store-info", storeId],
        queryFn: async () => {
            if (!storeId) return null;
            
            let data: any = null;
            let error: any = null;
            
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

    // ── Perfil de MÓDULO (Minha Imobiliária/Revenda/Empresa/Agência, Meus
    // Leilões/Arremates): detectado pelo alias da URL ou pelo ?tab= de entrada.
    // Se o dono salvou identidade/tema do módulo, eles sobrepõem os da loja.
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

    const { data: products = [], isLoading: loadingProducts } = useQuery<StoreProduct[]>({
        queryKey: ["public-store-products", storeId],
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
        refetchOnMount: "always",
        staleTime: 0,
        queryFn: async () => {
            const { data: oldProducts } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("merchant_store_id", storeId!)
                .eq("is_active", true)
                .order("is_featured", { ascending: false })
                .order("created_at", { ascending: false });
            const results: StoreProduct[] = (oldProducts || []).map((p: any) => ({
                id: p.id,
                title: p.title || "Sem título",
                short_description: p.short_description || null,
                image_url: p.image_url || null,
                price: parseBRLCurrency(p.price_label || "0"),
                original_price: null,
                price_label: p.price_label || null,
                cta_label: p.cta_label || "Comprar",
                tracking_slug: p.id,
                category: p.category || "Produto",
                condition: p.condition || "new",
                is_active: p.is_active ?? true,
                is_digital: false,
                is_featured: p.is_featured || false,
                created_at: p.created_at
            }));

            // Resolve userId: tenta merchant_stores → advertiser_accounts como fallback
            const { data: storeInfo } = await supabase.from("merchant_stores").select("user_id").eq("id", storeId!).maybeSingle();
            let userId: string | null | undefined = storeInfo?.user_id;
            if (!userId) {
                const { data: advAcc } = await (supabase.from("advertiser_accounts") as any)
                    .select("user_id")
                    .eq("id", storeId!)
                    .maybeSingle();
                userId = (advAcc as any)?.user_id;
            }
            if (!userId) {
                // URLs dos módulos (/imobiliaria/:uid, /revenda/:uid, /agencia/:uid…)
                // usam o user_id do dono direto — mesmo fallback da query da loja.
                const { data: prof } = await supabase.from("profiles").select("id").eq("id", storeId!).maybeSingle();
                userId = (prof as any)?.id;
            }

            if (userId) {
                const [pRes, rRes, vRes, sRes, fRes, viRes, advAccRes] = await Promise.all([
                    supabase.from("product_listings").select("*").eq("owner_user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
                    supabase.from("real_estate_listings").select("id, title, price_brl, description, visibility_status, created_at, real_estate_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", userId).eq("visibility_status", "published").order("created_at", { ascending: false }),
                    supabase.from("vehicle_listings").select("id, title, price_brl, description, visibility_status, created_at, vehicle_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", userId).eq("visibility_status", "published").order("created_at", { ascending: false }),
                    supabase.from("service_listings").select("*").eq("owner_user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
                    supabase.from("freight_listings").select("*").eq("owner_user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
                    supabase.from("travel_listings" as any).select("id, title, description, entry_price, price_per_person, total_price, visibility_status, created_at, travel_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", userId).eq("visibility_status", "published").order("created_at", { ascending: false }),
                    supabase.from("advertiser_accounts").select("id").eq("user_id", userId).maybeSingle()
                ]);

                let advRes: any = { data: null };
                if (advAccRes.data?.id) {
                    // Tenta com join — se falhar (FK no PostgREST), faz query simples sem join
                    advRes = await supabase.from("advertiser_listings").select("*, advertiser_listing_media(media_url)").eq("advertiser_account_id", advAccRes.data.id).order("created_at", { ascending: false });
                    if (advRes.error || !advRes.data) {
                        console.warn("[StorePublicPage] join falhou, refazendo sem mídia:", advRes.error);
                        advRes = await supabase.from("advertiser_listings").select("*").eq("advertiser_account_id", advAccRes.data.id).order("created_at", { ascending: false });
                    }
                }

                if (pRes.data) {
                    results.push(...pRes.data.map((p: any) => ({
                        id: p.id,
                        title: p.title || "Produto",
                        short_description: p.description || null,
                        image_url: p.cover_image_url || null,
                        price: p.price_brl || 0,
                        original_price: p.original_price_brl || null,
                        price_label: null,
                        cta_label: "Comprar / Ver Detalhes",
                        tracking_slug: p.id,
                        category: p.category || "Geral",
                        condition: p.condition || "new",
                        is_active: true,
                        is_digital: p.is_digital || false,
                        is_featured: p.is_featured || false,
                        created_at: p.created_at
                    })));
                }

                if (advRes.data) {
                    results.push(...advRes.data.map((a: any) => ({
                        id: a.id,
                        title: a.title || "Anúncio",
                        short_description: a.description || null,
                        image_url: a.advertiser_listing_media?.[0]?.media_url || null,
                        price: a.price || 0,
                        original_price: null,
                        price_label: a.price_label || null,
                        cta_label: a.cta_label || "Ver Mais",
                        tracking_slug: a.id,
                        category: "Serviços/Anúncios",
                        condition: "new",
                        is_active: true,
                        is_digital: false,
                        is_featured: false,
                        created_at: a.created_at
                    })));
                }

                if (rRes.data) {
                    results.push(...rRes.data.map((r: any) => {
                        const media = r.real_estate_media || [];
                        let img: string | null = null;
                        if (media.length > 0) {
                            const m0 = media[0];
                            const hasMasked = !!m0.public_masked_storage_path && m0.public_masked_storage_path !== m0.original_storage_path;
                            const path = hasMasked ? m0.public_masked_storage_path : m0.original_storage_path;
                            if (path) img = getListingImageUrl(path, hasMasked ? 'public' : 'original');
                        }
                        return {
                            id: r.id,
                            title: r.title || "Imóvel",
                            short_description: r.description || null,
                            image_url: img,
                            price: r.price_brl || 0,
                            original_price: null,
                            price_label: null,
                            cta_label: "Ver Imóvel",
                            tracking_slug: r.id,
                            category: "Imóveis",
                            condition: "new",
                            is_active: true,
                            is_digital: false,
                            is_featured: false,
                            created_at: r.created_at
                        };
                    }));
                }

                if (vRes.data) {
                    results.push(...vRes.data.map((v: any) => {
                        const media = v.vehicle_media || [];
                        let img: string | null = null;
                        if (media.length > 0) {
                            const m0 = media[0];
                            const hasMasked = !!m0.public_masked_storage_path && m0.public_masked_storage_path !== m0.original_storage_path;
                            const path = hasMasked ? m0.public_masked_storage_path : m0.original_storage_path;
                            if (path) img = getListingImageUrl(path, hasMasked ? 'public' : 'original');
                        }
                        return {
                            id: v.id,
                            title: v.title || "Veículo",
                            short_description: v.description || null,
                            image_url: img,
                            price: v.price_brl || 0,
                            original_price: null,
                            price_label: null,
                            cta_label: "Ver Veículo",
                            tracking_slug: v.id,
                            category: "Veículos",
                            condition: "used",
                            is_active: true,
                            is_digital: false,
                            is_featured: false,
                            created_at: v.created_at
                        };
                    }));
                }

                if (sRes.data) {
                    results.push(...sRes.data.map((s: any) => ({
                        id: s.id,
                        title: s.title || "Serviço",
                        short_description: s.description || null,
                        image_url: s.cover_image_url || null,
                        price: s.price_brl || s.base_price || 0,
                        original_price: null,
                        price_label: null,
                        cta_label: "Contratar",
                        tracking_slug: s.id,
                        category: "Serviços",
                        condition: "new",
                        is_active: true,
                        is_digital: false,
                        is_featured: false,
                        created_at: s.created_at
                    })));
                }

                if (fRes.data) {
                    results.push(...fRes.data.map((f: any) => ({
                        id: f.id,
                        title: f.title || "Frete / Mudança",
                        short_description: f.description || null,
                        image_url: f.cover_image_url || null,
                        price: f.price_brl || f.base_price || 0,
                        original_price: null,
                        price_label: null,
                        cta_label: "Solicitar Orçamento",
                        tracking_slug: f.id,
                        category: "Fretes",
                        condition: "new",
                        is_active: true,
                        is_digital: false,
                        is_featured: false,
                        created_at: f.created_at
                    })));
                }

                if (viRes.data) {
                    results.push(...viRes.data.map((vi: any) => {
                        const media = vi.travel_media || [];
                        const img: string | null = media.length > 0 ? resolveTravelMediaRow(media[0]) : null;
                        return {
                            id: vi.id,
                            title: vi.title || "Pacote de Viagem",
                            short_description: vi.description || null,
                            image_url: img,
                            price: Number(vi.total_price ?? vi.price_per_person ?? vi.entry_price) || 0,
                            original_price: null,
                            price_label: null,
                            cta_label: "Ver Pacote",
                            tracking_slug: vi.id,
                            category: "Viagens",
                            condition: "new",
                            is_active: true,
                            is_digital: false,
                            is_featured: false,
                            created_at: vi.created_at
                        };
                    }));
                }
            }

            return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        },
        enabled: !!storeId,
    });

    // "Recém-Chegados" é vitrine de TODA a plataforma (todos os vendedores),
    // diferente das outras abas da loja (que mostram só os itens deste vendedor).
    const { data: platformLatest = [] } = useQuery<StoreProduct[]>({
        queryKey: ["public-platform-recent-items"],
        queryFn: async () => {
            const results: StoreProduct[] = [];

            const { data: vitrineProducts } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("is_active", true)
                .order("created_at", { ascending: false })
                .limit(12);
            (vitrineProducts || []).forEach((p: any) => {
                results.push({
                    id: p.id,
                    title: p.title || "Sem título",
                    short_description: p.short_description || null,
                    image_url: p.image_url || null,
                    price: parseBRLCurrency(p.price_label || "0"),
                    original_price: null,
                    price_label: p.price_label || null,
                    cta_label: "Comprar",
                    tracking_slug: p.id,
                    category: p.category || "Produto",
                    condition: p.condition || "new",
                    is_active: p.is_active ?? true,
                    is_digital: false,
                    is_featured: p.is_featured || false,
                    created_at: p.created_at,
                    _kind: "product",
                    _ownerStoreId: p.merchant_store_id || null,
                } as StoreProduct & { _kind: string; _ownerStoreId: string | null });
            });

            const { data: advListings } = await (supabase.from("advertiser_listings") as any)
                .select("*, advertiser_listing_media(media_url)")
                .in("listing_status", ["active", "published"])
                .order("created_at", { ascending: false })
                .limit(12);
            (advListings || []).forEach((p: any) => {
                const mediaFallback = p.advertiser_listing_media?.[0]?.media_url ?? null;
                results.push({
                    id: p.id,
                    title: p.title || "Sem título",
                    short_description: p.description || null,
                    image_url: p.cover_image_url || mediaFallback,
                    price: p.price || 0,
                    original_price: null,
                    price_label: null,
                    cta_label: "Comprar",
                    tracking_slug: p.id,
                    category: p.category || "Produto",
                    condition: p.condition || "new",
                    is_active: true,
                    is_digital: p.is_digital ?? false,
                    is_featured: false,
                    created_at: p.created_at,
                    _kind: "product",
                    _ownerStoreId: null,
                } as StoreProduct & { _kind: string; _ownerStoreId: string | null });
            });

            const { data: vehicles } = await (supabase.from("vehicle_listings") as any)
                .select("id, title, price_brl, description, created_at, owner_user_id, vehicle_media(original_storage_path, public_masked_storage_path)")
                .eq("visibility_status", "published")
                .order("created_at", { ascending: false })
                .limit(12);
            (vehicles || []).forEach((v: any) => {
                let img: string | null = null;
                if (v.vehicle_media?.length > 0) {
                    const m0 = v.vehicle_media[0];
                    const hasMasked = !!m0.public_masked_storage_path && m0.public_masked_storage_path !== m0.original_storage_path;
                    const path = hasMasked ? m0.public_masked_storage_path : m0.original_storage_path;
                    if (path) img = getListingImageUrl(path, hasMasked ? 'public' : 'original');
                }
                results.push({
                    id: v.id,
                    title: v.title || "Veículo",
                    short_description: v.description || null,
                    image_url: img,
                    price: v.price_brl || 0,
                    original_price: null,
                    price_label: null,
                    cta_label: "Ver Veículo",
                    tracking_slug: v.id,
                    category: "Veículos",
                    condition: "used",
                    is_active: true,
                    is_digital: false,
                    is_featured: false,
                    created_at: v.created_at,
                    _kind: "vehicle",
                    _ownerStoreId: null,
                    _ownerUserId: v.owner_user_id || null,
                } as StoreProduct & { _kind: string; _ownerStoreId: string | null });
            });

            const { data: properties } = await (supabase.from("real_estate_listings") as any)
                .select("id, title, price_brl, description, created_at, owner_user_id, real_estate_media(original_storage_path, public_masked_storage_path)")
                .eq("visibility_status", "published")
                .order("created_at", { ascending: false })
                .limit(12);
            (properties || []).forEach((r: any) => {
                let img: string | null = null;
                if (r.real_estate_media?.length > 0) {
                    const m0 = r.real_estate_media[0];
                    const hasMasked = !!m0.public_masked_storage_path && m0.public_masked_storage_path !== m0.original_storage_path;
                    const path = hasMasked ? m0.public_masked_storage_path : m0.original_storage_path;
                    if (path) img = getListingImageUrl(path, hasMasked ? 'public' : 'original');
                }
                results.push({
                    id: r.id,
                    title: r.title || "Imóvel",
                    short_description: r.description || null,
                    image_url: img,
                    price: r.price_brl || 0,
                    original_price: null,
                    price_label: null,
                    cta_label: "Conhecer",
                    tracking_slug: r.id,
                    category: "Imóveis",
                    condition: "used",
                    is_active: true,
                    is_digital: false,
                    is_featured: false,
                    created_at: r.created_at,
                    _kind: "imovel",
                    _ownerStoreId: null,
                    _ownerUserId: r.owner_user_id || null,
                } as StoreProduct & { _kind: string; _ownerStoreId: string | null });
            });

            return results
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 12);
        },
        staleTime: 60_000,
        refetchInterval: 60_000,
    });

    // Query de avaliação REMOVIDA: a tabela product_rating_stats não existe no
    // banco (sempre 404 → stats null), então as estrelas nunca apareciam. Sem
    // fonte real de rating, não exibimos avaliação (decisão de produto 07-21).

    // Leilões e Arremates DESTA loja (novo fluxo: card de leilão/arremate abre a
    // loja na aba correta). Mesma leitura pública de auction_listings já usada em
    // /leiloes — só filtrada por store_id. Lazy: só busca quando a aba está ativa.
    const { data: storeAuctions = [], isLoading: loadingAuctions } = useQuery<any[]>({
        queryKey: ["public-store-auctions", storeId],
        enabled: !!storeId && (activeTab === "leiloes" || activeTab === "arremates"),
        refetchInterval: 15_000,
        queryFn: async () => {
            const { data } = await (supabase.from("auction_listings") as any)
                .select("*")
                .eq("store_id", storeId!)
                .not("status", "in", "(canceled,cancelled,cancelado,deleted,removed,draft)")
                .order("ends_at", { ascending: true });
            return data || [];
        },
    });

    const storeLeiloes = useMemo(
        () => storeAuctions.filter((a: any) => (a.listing_type ?? "auction") === "auction"),
        [storeAuctions]
    );
    const storeArremates = useMemo(
        () => storeAuctions.filter((a: any) => a.listing_type === "arremate"),
        [storeAuctions]
    );

    // Troca de aba + reflete o ?tab= na URL (compartilhável / sobrevive a refresh).
    const selectTab = (tab: TabValue) => {
        setActiveTab(tab);
        setActiveCategory("all");
        setSearch("");
        const next = new URLSearchParams(searchParams);
        if (tab === "home") next.delete("tab"); else next.set("tab", tab);
        setSearchParams(next, { replace: true });
    };

    // Tracking
    useEffect(() => {
        if (storeId && store) {
            trackM1Event({ 
                merchant_store_id: storeId, 
                event_type: "store_view", 
                city: store.city, 
                region: store.region 
            });
            trackStoreVisit(storeId, { 
                source: "store_page", 
                store_name: store.store_name,
                category_name: store.categoria,
                city: store.city,
                state: store.region
            });
        }
    }, [storeId, store, trackStoreVisit]);

    // Data Processing — Categorias oficiais do banco
    const { data: dbCategories = [] } = useQuery<{ id: string; nome: string }[]>({
        queryKey: ["categorias-loja-store"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("categorias_loja") as any)
                .select("id, nome")
                .order("nome");
            if (error) { console.error("[StorePublic] Categories error:", error); return []; }
            return (data || []) as { id: string; nome: string }[];
        },
        staleTime: 5 * 60 * 1000,
    });

    // Filtrar apenas categorias que possuem produtos nesta loja
    const categories = useMemo(() => {
        const productCats = new Set<string>();
        products.forEach(p => { if (p.category) productCats.add(p.category.toLowerCase()); });
        return dbCategories
            .filter(c => productCats.has(c.nome.toLowerCase()))
            .map(c => c.nome);
    }, [products, dbCategories]);

    const filteredProducts = useMemo(() => {
        let res = products;
        if (search.trim()) {
            const q = search.toLowerCase();
            res = res.filter(p => p.title.toLowerCase().includes(q) || (p.short_description || "").toLowerCase().includes(q));
        }
        if (activeCategory !== "all") {
            res = res.filter(p => p.category === activeCategory);
        }
        if (activeTab === "promo") {
            res = res.filter(p => (p.original_price || 0) > p.price);
        } else if (activeTab === "imoveis") {
            res = res.filter(p => p.category === "Imóveis");
        } else if (activeTab === "veiculos") {
            res = res.filter(p => p.category === "Veículos");
        } else if (activeTab === "servicos") {
            res = res.filter(p => p.category === "Serviços");
        } else if (activeTab === "fretes") {
            res = res.filter(p => p.category === "Fretes");
        } else if (activeTab === "viagens") {
            res = res.filter(p => p.category === "Viagens");
        }
        return res;
    }, [products, search, activeCategory, activeTab]);

    const homeFeatured = useMemo(() => products.filter(p => p.is_featured).slice(0, 6), [products]);
    const homeLatest = platformLatest;

    // Tema visual — em página de MÓDULO (imobiliária/revenda/leilões/arremates/
    // fretes/agência) vale SÓ a aparência do módulo (advertiser_module_profiles);
    // fora dela, a aparência da loja (merchant_stores.appearance). Sanitizado no
    // load; null = visual padrão da plataforma (nada muda).
    const appearance = useMemo(() => {
        if (publicModuleKey) return sanitizeAppearance((moduleProfile as any)?.appearance);
        return sanitizeAppearance((store as any)?.appearance);
    }, [store, moduleProfile, publicModuleKey]);

    // Identidade — SEPARAÇÃO TOTAL em página de módulo: a agência/imobiliária/
    // revenda NUNCA herda nome/logo/banner da loja do lojista (são negócios
    // distintos do mesmo dono). Sem perfil salvo, aparece "em branco" (neutra).
    const displayStore = useMemo(() => {
        if (!store || !publicModuleKey) return store;
        const mp: any = moduleProfile || {};
        return {
            ...store,
            store_name: mp.display_name || BUSINESS_MODULES[publicModuleKey].noun,
            description: mp.description || null,
            logo_url: mp.logo_url || null,
            banner_url: mp.banner_url || null,
            city: mp.city || null,
            region: mp.state || null,
            bairro: null,
            logradouro: null,
            whatsapp: mp.whatsapp || null,
        };
    }, [store, moduleProfile, publicModuleKey]);
    const productLayout = appearance?.layout.products ?? "carousel";
    const productGridClass =
        productLayout === "grid" ? "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4"
        : productLayout === "large" ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
        : productLayout === "compact" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
        : null; // carousel (padrão)

    const handleAddToCart = (product: StoreProduct) => {
        cart.addItem(product.id, 1);
        globalCart.addItem(
            storeId!, product.id, 1, product.title, product.image_url, product.price, store?.store_name || "Loja", store?.logo_url || null
        );
        
        setRecentlyAdded(prev => ({ ...prev, [product.id]: true }));
        toast.success(`${product.title} adicionado à cesta!`, { description: "Clique na cesta para finalizar." });
        setTimeout(() => setRecentlyAdded(prev => ({ ...prev, [product.id]: false })), 3000);
    };

    const handleAskQuestion = (product: StoreProduct) => {
        // Abre o modal: o visitante escreve a pergunta, registramos no painel
        // do vendedor (advertiser_contact_intentions) e só depois oferecemos o
        // WhatsApp. Antes ia direto pro WhatsApp e a mensagem nunca chegava
        // ao painel /anunciante/mensagens.
        setInquiryProduct(product);
    };

    const handleMakeOffer = (product: StoreProduct) => {
        setOfferProduct(product);
    };

    // ── PRODUTO EM DESTAQUE (?product=) ──────────────────────────────────────
    // 1) Resolve pelo array já carregado (sem fetch novo no caso comum).
    const featuredFromList = useMemo(
        () => (highlightedProductId ? products.find(p => p.id === highlightedProductId) ?? null : null),
        [products, highlightedProductId]
    );
    // 2) Fallback: produto ainda não veio no array (ex.: chegada via redirect
    //    antes do refetch). Só dispara quando não achou na lista.
    const { data: featuredFallback } = useQuery<StoreProduct | null>({
        queryKey: ["store-featured-product", storeId, highlightedProductId],
        enabled: !!highlightedProductId && !featuredFromList,
        queryFn: async () => {
            // CAMADA ÚNICA de resolução (multimódulo). A StorePublicPage NÃO conhece
            // tabela: pede "encontre este produto" e recebe objeto padronizado.
            // Novo módulo = registrar no resolveProductById; aqui nada muda.
            const r = await resolveProductById(highlightedProductId!);
            if (!r) return null;
            return {
                id: r.id, title: r.title, price: r.price, original_price: null,
                image_url: normalizeImageUrl(r.image_url), short_description: r.description,
                category: r.category, tracking_slug: null, is_featured: false,
                cta_label: null, stock: null,
                _module: r.module, _modality: r.modality,
            } as unknown as StoreProduct;
        },
    });
    const featuredProduct: StoreProduct | null = featuredFromList ?? featuredFallback ?? null;

    // Tipo do anúncio em destaque — vem do resolver (_module) ou é derivado da
    // categoria quando o item já estava na lista da loja. Define o CTA correto:
    // produto usa cesta/interesse; os demais módulos levam à página de ação
    // completa (lance, orçamento, visita etc.) sem perder a loja no histórico.
    const featuredKind: string = (() => {
        const m = (featuredProduct as any)?._module;
        if (m) return m;
        switch (featuredProduct?.category) {
            case "Imóveis": return "real_estate";
            case "Veículos": return "vehicles";
            case "Serviços": return "services";
            case "Fretes": return "freight";
            case "Viagens": return "travel";
            default: return "product";
        }
    })();
    const featuredModality: string | null = (featuredProduct as any)?._modality ?? null;
    // expand: true → abre o DETALHE COMPLETO DENTRO da página do anunciante
    // (?view=full), mantendo o cabeçalho visível. path → módulos que ainda
    // navegam para a página de ação isolada (padrão a migrar módulo a módulo).
    const featuredAction: { label: string; path?: string; expand?: boolean } | null = (() => {
        if (!featuredProduct) return null;
        switch (featuredKind) {
            case "real_estate": return { label: "Ver Imóvel Completo", path: `/imoveis/${featuredProduct.id}` };
            case "vehicles": return { label: "Ver Veículo Completo", path: `/veiculos/${featuredProduct.id}` };
            case "services": return { label: "Contratar Serviço", path: `/servicos/${featuredProduct.id}` };
            case "freight": return { label: "Solicitar Orçamento", path: `/fretes/${featuredProduct.id}` };
            case "travel": return { label: "Ver Pacote Completo", expand: true };
            case "auction": return {
                label: featuredModality === "arremate" ? "Fazer Oferta" : "Dar Lance Agora",
                path: `/mercado/leiloes/${featuredProduct.id}`,
            };
            default: return null; // produto comum → cesta/interesse
        }
    })();

    // ── DETALHE COMPLETO DENTRO DA PÁGINA (?view=full) ──────────────────────
    // O usuário nunca sai da página do anunciante: só o miolo troca (resumo ⇄
    // detalhe completo); cabeçalho, abas e demais anúncios permanecem.
    const fullView = searchParams.get("view") === "full";
    const openFullView = () => {
        const next = new URLSearchParams(searchParams);
        next.set("view", "full");
        setSearchParams(next, { replace: false }); // push → Voltar do navegador fecha o detalhe
    };
    const closeFullView = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("view");
        setSearchParams(next, { replace: false });
    };
    const showEmbeddedFull = fullView && featuredKind === "travel" && !!highlightedProductId;

    // Trocar de produto SEM sair da loja — só muda o ?product= (Voltar funciona).
    const selectProduct = (id: string) => {
        const next = new URLSearchParams(searchParams);
        next.set("product", id);
        setSearchParams(next, { replace: false });
    };

    // Scroll até o destaque — dep = ID (string estável), nunca o objeto (evita
    // re-scroll a cada refetch de 15s da lista de produtos).
    useEffect(() => {
        if (highlightedProductId && featuredProduct) {
            featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightedProductId, featuredProduct?.id]);

    // ── Financeiro/tracking do PRODUTO em destaque (movido da ProductLandingPage
    //    que virou redirect). RPC idempotente por sessão — não cobra em dobro. ──
    useEffect(() => {
        if (!featuredProduct?.id || !storeId) return;
        // Tracking de clique/visita do produto (M1 + marketplace)
        trackM1Event({
            merchant_store_id: storeId, product_id: featuredProduct.id,
            event_type: "product_click", city: store?.city, region: store?.region, bairro: store?.bairro,
        });
        trackProductVisit(featuredProduct.id, storeId, {
            source: "store_highlight", page: window.location.pathname,
            product_title: featuredProduct.title, store_name: store?.store_name,
            category_name: featuredProduct.category, city: store?.city, state: store?.region, neighborhood: store?.bairro,
        });
        // Dedução de -1 crédito por view — MESMA RPC SECURITY DEFINER idempotente
        // (guardada por sessionStorage). Front não calcula nada; só chama a RPC.
        const deductKey = `credit_deducted_${featuredProduct.id}`;
        if (sessionStorage.getItem(deductKey)) return;
        (async () => {
            try {
                const { data: rpcResult, error } = await (supabase as any).rpc("deduct_store_product_view_credit", {
                    p_product_id: featuredProduct.id, p_store_id: storeId,
                    p_session_key: deductKey, p_product_title: featuredProduct.title ?? null,
                });
                if (!error && rpcResult?.success) sessionStorage.setItem(deductKey, "1");
            } catch (err) { console.error("[CreditDeduct/store]", err); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [featuredProduct?.id, storeId]);

    if (loadingStore || loadingProducts) {
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
                    <Button onClick={() => navigate("/mercado")} className="bg-zinc-900 text-white rounded-2xl h-14 px-10 font-black uppercase text-xs tracking-widest gap-2">
                        <ArrowLeft className="w-4 h-4" /> Voltar ao Mercado
                    </Button>
                </div>
            </MarketLayout>
        );
    }

    return (
        <MarketLayout
            search={search}
            setSearch={setSearch}
            mainClassName={appearance ? "flex flex-col" : "bg-[#F5E62B] flex flex-col"}
            blueFooter
            blueFooterLabel={`${publicModuleKey ? BUSINESS_MODULES[publicModuleKey].noun : "Loja"}: ${displayStore.store_name}`}
            headerChildren={<MarketNavButtons />}
        >
            <StoreThemeScope appearance={appearance}>
            <div className="min-h-screen pb-24">

                {/* ─── HEADER PREMIUM ─── */}
                {/* stats (avaliação) removido: fonte product_rating_stats não existe → sempre vazio */}
                <StoreHeader
                    store={displayStore}
                    profileType={publicModuleKey ? BUSINESS_MODULES[publicModuleKey].profileType : (store.categoria || "general")}
                    productsCount={products.length}
                    whatsappNumber={publicModuleKey ? ((moduleProfile as any)?.whatsapp || null) : (paySettings?.store_whatsapp || null)}
                    onShare={() => {
                        const url = window.location.href;
                        navigator.share?.({ title: displayStore.store_name, url }).catch(() => {});
                    }}
                    logoUrl={normalizeImageUrl(displayStore.logo_url, 'logos_lojas')}
                    bannerUrl={normalizeImageUrl(displayStore.banner_url)}
                />

                {/* ─── BREADCRUMB: Início > Categoria > Loja > Produto ─── */}
                <div className="w-full px-4 lg:px-8 xl:px-12 pt-4">
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild><Link to="/mercado">Início</Link></BreadcrumbLink>
                            </BreadcrumbItem>
                            {featuredProduct?.category && (
                                <>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        <BreadcrumbLink asChild>
                                            <Link to={`/mercado?q=${encodeURIComponent(featuredProduct.category)}`}>
                                                {featuredProduct.category}
                                            </Link>
                                        </BreadcrumbLink>
                                    </BreadcrumbItem>
                                </>
                            )}
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                {featuredProduct ? (
                                    <BreadcrumbLink asChild><Link to={`/loja/${storeId}`}>{store.store_name}</Link></BreadcrumbLink>
                                ) : (
                                    <BreadcrumbPage>{store.store_name}</BreadcrumbPage>
                                )}
                            </BreadcrumbItem>
                            {featuredProduct && (
                                <>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        <BreadcrumbPage className="line-clamp-1 max-w-[220px]">{featuredProduct.title}</BreadcrumbPage>
                                    </BreadcrumbItem>
                                </>
                            )}
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>

                {/* ─── PRODUTO EM DESTAQUE (quando ?product=) ─── */}
                {featuredProduct && (
                    <div ref={featuredRef} className="w-full px-4 lg:px-8 xl:px-12 pt-6 scroll-mt-[120px]">
                        {showEmbeddedFull ? (
                            /* PACOTE COMPLETO dentro da página da Agência — cabeçalho permanece */
                            <TravelFullView listingId={highlightedProductId!} embedded onBack={closeFullView} />
                        ) : (
                        <div className="bg-white rounded-3xl border border-zinc-200 shadow-lg overflow-hidden flex flex-col md:flex-row">
                            <div className="md:w-2/5 aspect-square md:aspect-auto bg-zinc-50 shrink-0 overflow-hidden flex items-center justify-center">
                                {featuredProduct.image_url ? (
                                    <img src={featuredProduct.image_url} alt={featuredProduct.title} className="w-full h-full object-cover" />
                                ) : (
                                    <ShoppingBag className="w-16 h-16 text-zinc-200" />
                                )}
                            </div>
                            <div className="flex-1 p-6 md:p-8 flex flex-col gap-3">
                                <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">Anúncio selecionado</span>
                                <h1 className="text-2xl md:text-3xl font-black text-zinc-900 leading-tight">{featuredProduct.title}</h1>
                                {featuredProduct.short_description && (
                                    <p className="text-sm text-zinc-500 leading-relaxed line-clamp-4">{featuredProduct.short_description}</p>
                                )}
                                <div className="text-3xl font-black text-[#FF6A00] mt-1">
                                    {featuredProduct.price > 0
                                        ? featuredProduct.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                        : "Consultar"}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-auto pt-3">
                                    {featuredAction ? (
                                        <Button onClick={() => (featuredAction.expand ? openFullView() : navigate(featuredAction.path!))} className="h-12 px-6 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-widest rounded-xl gap-2">
                                            {featuredAction.label}
                                        </Button>
                                    ) : (
                                        <Button onClick={() => handleAddToCart(featuredProduct)} className="h-12 px-6 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-widest rounded-xl gap-2">
                                            <ShoppingCart className="w-4 h-4" /> Adicionar à cesta
                                        </Button>
                                    )}
                                    <Button onClick={() => handleAskQuestion(featuredProduct)} variant="outline" className="h-12 px-6 font-black uppercase text-xs tracking-widest rounded-xl border-zinc-300">
                                        Tenho Interesse
                                    </Button>
                                </div>
                            </div>
                        </div>
                        )}

                        {/* ─── 🏪 MAIS PRODUTOS DESTA LOJA (carrossel; clique troca o destaque sem sair da loja) ─── */}
                        {(() => {
                            const others = products
                                .filter(p => p.id !== featuredProduct.id)
                                .sort((a, b) =>
                                    (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) ||
                                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                                );
                            if (others.length === 0) return null; // loja com um único produto → oculta

                            const catCounts = new Map<string, number>();
                            others.forEach(p => {
                                const c = p.category || "Outros";
                                catCounts.set(c, (catCounts.get(c) || 0) + 1);
                            });
                            const filtered = moreCat === "all" ? others : others.filter(p => (p.category || "Outros") === moreCat);
                            const visible = filtered.slice(0, moreLimit);
                            const hasMore = filtered.length > moreLimit;

                            return (
                                <div className="mt-8 space-y-4">
                                    <div className="flex flex-wrap items-end justify-between gap-2">
                                        <div>
                                            <h3 className="st-heading text-xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                                <Store className="st-accent w-5 h-5 text-[#FF6A00]" /> Mais produtos desta loja
                                            </h3>
                                            <p className="st-muted text-xs font-bold text-zinc-500 mt-0.5">
                                                Esta loja possui {products.length} {products.length === 1 ? "produto anunciado" : "produtos anunciados"}.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Filtros rápidos por categoria (só quando há mais de uma) */}
                                    {catCounts.size > 1 && (
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                            <button
                                                onClick={() => { setMoreCat("all"); setMoreLimit(12); }}
                                                className={cn(
                                                    "shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                                    moreCat === "all" ? "st-chip-active bg-[#FF6A00] text-white" : "bg-white border border-zinc-200 text-zinc-500 hover:border-[#FF6A00]/40"
                                                )}
                                            >
                                                Todos ({others.length})
                                            </button>
                                            {[...catCounts.entries()].map(([cat, n]) => (
                                                <button
                                                    key={cat}
                                                    onClick={() => { setMoreCat(cat); setMoreLimit(12); }}
                                                    className={cn(
                                                        "shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                                                        moreCat === cat ? "st-chip-active bg-[#FF6A00] text-white" : "bg-white border border-zinc-200 text-zinc-500 hover:border-[#FF6A00]/40"
                                                    )}
                                                >
                                                    {cat} ({n})
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <HorizontalCarousel cardWidth="w-[calc(100vw-2rem)] sm:w-[280px]" gap="gap-4" alwaysShowArrows>
                                        {[
                                            ...visible.map(p => (
                                                <StorePremiumCard
                                                    key={p.id}
                                                    product={p}
                                                    isRecentlyAdded={recentlyAdded[p.id]}
                                                    onAddToCart={handleAddToCart}
                                                    onAskQuestion={handleAskQuestion}
                                                    onMakeOffer={handleMakeOffer}
                                                    onClick={() => selectProduct(p.id)}
                                                />
                                            )),
                                            ...(hasMore ? [(
                                                <button
                                                    key="load-more"
                                                    onClick={() => setMoreLimit(l => l + 12)}
                                                    className="h-full min-h-[260px] w-full rounded-[24px] border-2 border-dashed border-zinc-300 bg-white/60 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:border-[#FF6A00]/50 hover:text-[#FF6A00] transition-all"
                                                >
                                                    <Sparkles className="w-6 h-6" />
                                                    <span className="text-xs font-black uppercase tracking-wider">
                                                        Ver mais ({filtered.length - moreLimit})
                                                    </span>
                                                </button>
                                            )] : []),
                                        ]}
                                    </HorizontalCarousel>
                                </div>
                            );
                        })()}
                    </div>
                )}


                {/* ─── STICKY TABS NAVIGATION ─── */}
                <div className="st-surface sticky top-[64px] lg:top-[80px] z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200 mb-8 shadow-sm">
                    <div className="w-full px-4 lg:px-8 xl:px-12 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-6 lg:gap-8 min-w-max">
                            <button
                                onClick={() => selectTab("home")}
                                className={cn("py-4 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "home" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                            >
                                Página Principal
                            </button>
                            <button
                                onClick={() => selectTab("all")}
                                className={cn("py-4 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "all" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                            >
                                Todos os Produtos
                            </button>
                            <button
                                onClick={() => selectTab("leiloes")}
                                className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "leiloes" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                            >
                                <Gavel className={cn("w-4 h-4", activeTab === "leiloes" ? "text-[#FF6A00]" : "")} />
                                Leilões
                            </button>
                            <button
                                onClick={() => selectTab("arremates")}
                                className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "arremates" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                            >
                                <Gavel className={cn("w-4 h-4", activeTab === "arremates" ? "text-blue-500" : "")} />
                                Arremates
                            </button>
                            <button
                                onClick={() => selectTab("promo")}
                                className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "promo" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                            >
                                <Flame className={cn("w-4 h-4", activeTab === "promo" ? "text-orange-500" : "")} />
                                Promoções
                            </button>
                            {products.some(p => p.category === "Imóveis") && (
                                <button
                                    onClick={() => selectTab("imoveis")}
                                    className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "imoveis" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                                >
                                    Imóveis
                                </button>
                            )}
                            {products.some(p => p.category === "Veículos") && (
                                <button
                                    onClick={() => selectTab("veiculos")}
                                    className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "veiculos" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                                >
                                    Veículos
                                </button>
                            )}
                            {products.some(p => p.category === "Serviços") && (
                                <button
                                    onClick={() => selectTab("servicos")}
                                    className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "servicos" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                                >
                                    Serviços
                                </button>
                            )}
                            {products.some(p => p.category === "Fretes") && (
                                <button
                                    onClick={() => selectTab("fretes")}
                                    className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "fretes" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                                >
                                    Fretes
                                </button>
                            )}
                            {products.some(p => p.category === "Viagens") && (
                                <button
                                    onClick={() => selectTab("viagens")}
                                    className={cn("py-4 flex items-center gap-1.5 text-sm font-black uppercase tracking-wider border-b-4 transition-colors", activeTab === "viagens" ? "st-tab-active border-[#FF6A00] text-[#FF6A00]" : "border-transparent text-zinc-500 hover:text-zinc-800")}
                                >
                                    Viagens
                                </button>
                            )}
                        </div>

                        {/* Desktop Search */}
                        <div className="hidden lg:block relative w-[300px] shrink-0 my-2">
                            <Input 
                                placeholder="Buscar nesta loja..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-10 pl-10 rounded-lg bg-zinc-100 border-none focus-visible:ring-[#FF6A00]"
                            />
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        </div>
                    </div>
                </div>

                <div className="w-full px-4 lg:px-8 xl:px-12 flex flex-col lg:flex-row gap-8">
                    
                    {/* ─── SIDEBAR DE CATEGORIAS (Desktop) ─── */}
                    {categories.length > 0 && (
                        <aside className="hidden lg:block w-64 shrink-0">
                            <div className="st-card sticky top-[160px] bg-white p-6 rounded-3xl shadow-lg border border-zinc-100">
                                <h3 className="st-heading text-xs font-black text-zinc-900 uppercase tracking-widest mb-6">Navegar por</h3>
                                <div className="space-y-1">
                                    <button
                                        onClick={() => { setActiveCategory("all"); setActiveTab("all"); }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[11px] tracking-wider font-black uppercase transition-all",
                                            activeCategory === "all" ? "st-chip-active bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/20" : "st-muted text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                                        )}
                                    >
                                        <span>Todas as Categorias</span>
                                    </button>
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => { setActiveCategory(cat); setActiveTab("all"); }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-4 py-3 rounded-2xl text-[11px] tracking-wider font-black uppercase transition-all text-left",
                                                activeCategory === cat ? "st-chip-active bg-[#FF6A00] text-white shadow-md shadow-[#FF6A00]/20" : "st-muted text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                                            )}
                                        >
                                            <span className="line-clamp-2">{cat}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </aside>
                    )}

                    {/* ─── CONTEÚDO PRINCIPAL ─── */}
                    <div className="flex-1 min-w-0">
                        {/* ─── TAB: HOME ─── */}
                        {activeTab === "home" && !search && (
                            <div className="flex flex-col gap-12">
                                {/* Horizontal Categories Row (Mobile Only) */}
                                {categories.length > 0 && (
                                    <div className="space-y-4 lg:hidden">
                                    <div className="flex items-center justify-between">
                                        <h3 className="st-heading text-xl font-black text-zinc-900 uppercase tracking-tight">Categorias da Loja</h3>
                                    </div>
                                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                                        <button 
                                            onClick={() => { setActiveCategory("all"); setActiveTab("all"); }}
                                            className="flex flex-col items-center gap-2 min-w-[72px]"
                                        >
                                            <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center shadow-sm">
                                                <LayoutGrid className="w-6 h-6 text-zinc-400" />
                                            </div>
                                            <span className="text-[10px] font-bold uppercase text-zinc-500">Tudo</span>
                                        </button>
                                        {categories.map(cat => (
                                            <button 
                                                key={cat}
                                                onClick={() => { setActiveCategory(cat); setActiveTab("all"); }}
                                                className="flex flex-col items-center gap-2 min-w-[72px] shrink-0"
                                            >
                                                <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm hover:ring-2 ring-orange-200 transition-all">
                                                    <span className="text-orange-500 font-bold text-xl uppercase">{cat.substring(0,2)}</span>
                                                </div>
                                                <span className="text-[10px] font-bold uppercase text-zinc-600 truncate max-w-[72px]">{cat}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section: Destaques */}
                            {homeFeatured.length > 0 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="st-heading text-2xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                            <Sparkles className="st-accent w-6 h-6 text-[#FF6A00]" /> Produtos em Destaque
                                        </h3>
                                        <Button variant="ghost" className="st-accent text-[#FF6A00] font-bold text-xs uppercase" onClick={() => setActiveTab("all")}>
                                            Ver Tudo
                                        </Button>
                                    </div>
                                    <HorizontalCarousel cardWidth="w-[calc(100vw-2rem)] sm:w-[280px]" gap="gap-4">
                                        {homeFeatured.map(product => (
                                            <StorePremiumCard 
                                                key={product.id}
                                                product={product}
                                                isRecentlyAdded={recentlyAdded[product.id]}
                                                onAddToCart={handleAddToCart}
                                                onAskQuestion={handleAskQuestion}
                                                onMakeOffer={handleMakeOffer}
                                                onClick={() => {
                                                    if (storeId) {
                                                        consumeMarketplaceProductClick({
                                                            productId: product.id,
                                                            storeId,
                                                            source: "store_page",
                                                        });
                                                    }
                                                    // Novo fluxo: TODO item da própria loja destaca na página (sem sair);
                                                    // o CTA do destaque leva à página de ação completa quando for o caso.
                                                    selectProduct(product.id);
                                                }}
                                            />
                                        ))}
                                    </HorizontalCarousel>
                                </div>
                            )}

                            {/* Section: Novidades */}
                            {homeLatest.length > 0 && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="st-heading text-2xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                                            Recém-Chegados
                                        </h3>
                                    </div>
                                    <HorizontalCarousel cardWidth="w-[calc(100vw-2rem)] sm:w-[280px]" gap="gap-4">
                                        {homeLatest.map(product => (
                                            <StorePremiumCard
                                                key={product.id}
                                                product={product}
                                                isRecentlyAdded={recentlyAdded[product.id]}
                                                onAddToCart={handleAddToCart}
                                                onAskQuestion={handleAskQuestion}
                                                onMakeOffer={handleMakeOffer}
                                                onClick={() => {
                                                    const kind = (product as any)._kind;
                                                    // Novo fluxo: item de outro vendedor abre a página do DONO com o
                                                    // anúncio em destaque; sem dono conhecido, cai no detalhe isolado.
                                                    if (kind === "vehicle") {
                                                        const owner = (product as any)._ownerUserId;
                                                        navigate(owner
                                                            ? publicAdvertiserPath("veiculos", owner, product.id)
                                                            : `/veiculos/${product.tracking_slug || product.id}`);
                                                        return;
                                                    }
                                                    if (kind === "imovel") {
                                                        const owner = (product as any)._ownerUserId;
                                                        navigate(owner
                                                            ? publicAdvertiserPath("imoveis", owner, product.id)
                                                            : `/imoveis/${product.tracking_slug || product.id}`);
                                                        return;
                                                    }
                                                    const ownerStoreId = (product as any)._ownerStoreId;
                                                    if (ownerStoreId) {
                                                        consumeMarketplaceProductClick({
                                                            productId: product.id,
                                                            storeId: ownerStoreId,
                                                            source: "store_page_recem_chegados",
                                                        });
                                                        // "Recém-Chegados" = plataforma toda → abre a loja DONA com o produto em destaque.
                                                        if (ownerStoreId === storeId) selectProduct(product.id);
                                                        else navigate(`/loja/${ownerStoreId}?product=${product.id}`);
                                                    } else {
                                                        navigate(`/produto/${product.id}`);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </HorizontalCarousel>
                                </div>
                            )}
                        </div>
                    )}

                        {/* ─── TAB: LEILÕES / ARREMATES (itens desta loja) ─── */}
                        {(activeTab === "leiloes" || activeTab === "arremates") && (() => {
                            const isLeiloes = activeTab === "leiloes";
                            const items = isLeiloes ? storeLeiloes : storeArremates;
                            return (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", isLeiloes ? "bg-[#FF6A00]/10 text-[#FF6A00]" : "bg-blue-500/10 text-blue-500")}>
                                            <Gavel className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h2 className="st-heading text-2xl font-black text-zinc-900 uppercase tracking-tight">
                                                {isLeiloes ? "Leilões da Loja" : "Arremates da Loja"}
                                            </h2>
                                            <p className="st-muted text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                                                {items.length} {items.length === 1 ? "item" : "itens"} · {store.store_name}
                                            </p>
                                        </div>
                                    </div>

                                    {loadingAuctions ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                                            {[0, 1, 2].map(i => (
                                                <div key={i} className="h-[420px] rounded-3xl bg-zinc-100 animate-pulse" />
                                            ))}
                                        </div>
                                    ) : items.length === 0 ? (
                                        <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-dashed border-zinc-200">
                                            <Gavel className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                                            <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">
                                                {isLeiloes ? "Esta loja não tem leilões no momento." : "Esta loja não tem arremates no momento."}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                                            {items.map((a: any) => (
                                                <MarketAuctionCard key={a.id} listing={a} variant="carousel" linkTo="detail" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* ─── TAB: ALL PRODUCTS / PROMOS / SEARCH ─── */}
                        {/* Produtos aparecem nas abas de produto OU quando há busca ativa
                            (busca vale em qualquer aba de produto), mas NUNCA nas abas
                            Leilões/Arremates (que têm seu próprio render acima). */}
                        {activeTab !== "leiloes" && activeTab !== "arremates" && (activeTab !== "home" || search) && (
                            <div className="space-y-6">
                                
                                {/* Category Filter Pills (Mobile Only if not promo) */}
                                {activeTab !== "promo" && !search && categories.length > 0 && (
                                    <div className="flex lg:hidden items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                                    <Badge 
                                        className={cn("px-4 py-2 cursor-pointer font-bold uppercase", activeCategory === "all" ? "bg-zinc-900 text-white" : "bg-white text-zinc-500 hover:bg-zinc-100 border border-zinc-200")}
                                        onClick={() => setActiveCategory("all")}
                                    >
                                        Todos
                                    </Badge>
                                    {categories.map(cat => (
                                        <Badge 
                                            key={cat}
                                            className={cn("px-4 py-2 cursor-pointer font-bold uppercase", activeCategory === cat ? "bg-[#FF6A00] text-white" : "bg-white text-zinc-500 hover:bg-zinc-100 border border-zinc-200")}
                                            onClick={() => setActiveCategory(cat)}
                                        >
                                            {cat}
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            {/* Grid */}
                            {filteredProducts.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-dashed border-zinc-200">
                                    <ShoppingBag className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">
                                        Nenhum produto encontrado.
                                    </p>
                                </div>
                            ) : (() => {
                                const cards = filteredProducts.map(product => (
                                    <StorePremiumCard
                                        key={product.id}
                                        product={product}
                                        isRecentlyAdded={recentlyAdded[product.id]}
                                        onAddToCart={handleAddToCart}
                                        onAskQuestion={handleAskQuestion}
                                        onMakeOffer={handleMakeOffer}
                                        onClick={() => {
                                            if (storeId) {
                                                consumeMarketplaceProductClick({
                                                    productId: product.id,
                                                    storeId,
                                                    source: "store_page",
                                                });
                                            }
                                            // Novo fluxo: TODO item da própria loja destaca na página (sem sair);
                                            // o CTA do destaque leva à página de ação completa quando for o caso.
                                            selectProduct(product.id);
                                        }}
                                    />
                                ));
                                // Estilo dos produtos definido no tema da loja (grid/cards grandes/
                                // compacto); carrossel = comportamento padrão da plataforma.
                                return productGridClass ? (
                                    <div className={productGridClass}>{cards}</div>
                                ) : (
                                    <HorizontalCarousel cardWidth="w-[calc(100vw-2rem)] sm:w-[280px]" gap="gap-4">
                                        {cards}
                                    </HorizontalCarousel>
                                );
                            })()}
                        </div>
                    )}
                    </div>
                </div>

                {/* ─── CART DRAWER E OTHERS ─── */}
                <StoreCartDrawer
                    open={cartOpen}
                    onOpenChange={setCartOpen}
                    storeId={storeId!}
                    storeName={store.store_name}
                    cart={cart}
                />

                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-4">
                    {/* Cart FAB (Always visible floating button style) */}
                    <button 
                        onClick={() => setCartOpen(true)}
                        className={cn(
                            "w-14 h-14 rounded-full bg-zinc-900 text-white shadow-2xl flex flex-col items-center justify-center transition-all transform ring-4 ring-white relative",
                            cart.totalItems > 0 ? "scale-100" : "scale-90 opacity-90 hover:scale-100"
                        )}
                    >
                        <ShoppingCart className="w-5 h-5" />
                        {cart.totalItems > 0 && (
                            <span className="absolute -top-2 -right-2 bg-[#FF6A00] text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                                {cart.totalItems}
                            </span>
                        )}
                    </button>
                </div>

                <div className="w-full px-4 lg:px-8 xl:px-12 mt-20 flex justify-center">
                    {/* Selo de conexão: a Viagg-TX8 é vitrine/plataforma — a negociação é
                        direta entre as partes (não vendedora nem intermediadora). */}
                    <div className="inline-flex flex-col items-center justify-center gap-2.5 bg-white px-6 sm:px-9 py-4 sm:py-5 rounded-xl shadow-lg border border-zinc-100 ring-2 ring-zinc-50 max-w-[95vw] text-center">
                        <div className="flex flex-col leading-snug min-w-0">
                            <span className="font-black uppercase text-[11px] sm:text-sm tracking-[0.1em] text-zinc-900">
                                A Plataforma Apresenta o Produto
                            </span>
                            <span className="mt-0.5 text-[10.5px] sm:text-xs font-medium text-zinc-600 leading-snug">
                                A negociação acontece diretamente entre comprador e vendedor.
                            </span>
                        </div>
                        <img src="/viagg-logo.png" alt="Viagg-TX8" className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-md shadow-xs shrink-0 mt-1" />
                    </div>
                </div>

            </div>
            </StoreThemeScope>

            <ProductInquiryModal
                open={!!inquiryProduct}
                onClose={() => setInquiryProduct(null)}
                product={inquiryProduct ? {
                    id: inquiryProduct.id,
                    title: inquiryProduct.title,
                    image_url: inquiryProduct.image_url,
                    price_label: inquiryProduct.price ? String(inquiryProduct.price) : null,
                    store_name: store?.store_name || null,
                    city: store?.city || null,
                } : null}
            />

            <DiscountRequestModal
                open={!!offerProduct}
                onClose={() => setOfferProduct(null)}
                product={offerProduct ? {
                    id: offerProduct.id,
                    title: offerProduct.title,
                    image_url: offerProduct.image_url,
                    price_label: offerProduct.price ? String(offerProduct.price) : null,
                    store_name: store?.store_name || null,
                    city: store?.city || null,
                    merchant_store_id: storeId || null,
                } : null}
            />

            <InstitutionalSafetyBanner />
        </MarketLayout>
    );
}
