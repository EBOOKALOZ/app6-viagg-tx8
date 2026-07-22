import { useMemo, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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

type TabValue = "home" | "all" | "promo" | "leiloes" | "arremates";

// Mapeia o ?tab= da URL (usado pelo novo fluxo card-de-leilão → loja) para a aba.
function tabFromParam(p: string | null): TabValue | null {
    if (p === "leiloes" || p === "leilao" || p === "leiloes" || p === "leilões") return "leiloes";
    if (p === "arremates" || p === "arremate") return "arremates";
    if (p === "all" || p === "promo" || p === "home") return p;
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

    // UI State — aba inicial pode vir de ?tab= (novo fluxo: clicar num card de
    // leilão/arremate abre a loja já na aba correta).
    const [search, setSearch] = useState("");
    const [cartOpen, setCartOpen] = useState(false);
    const [recentlyAdded, setRecentlyAdded] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<TabValue>(() => tabFromParam(searchParams.get("tab")) ?? "home");
    const [activeCategory, setActiveCategory] = useState<string>("all");
    const [inquiryProduct, setInquiryProduct] = useState<StoreProduct | null>(null);
    const [offerProduct, setOfferProduct] = useState<StoreProduct | null>(null);

    // Fetchers
    const cart = useStoreCart(storeId);
    const globalCart = useGlobalCart();
    const { settings: paySettings } = useStorePaymentSettings(storeId);
    const { trackStoreVisit } = useMarketplaceTracking();

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
                    const { data: realStore } = await supabase.from("merchant_stores").select("*").eq("user_id", targetUserId).maybeSingle();
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

            if (userId) {
                const [pRes, rRes, vRes, advAccRes] = await Promise.all([
                    supabase.from("product_listings").select("*").eq("owner_user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
                    supabase.from("real_estate_listings").select("id, title, price_brl, description, visibility_status, created_at, real_estate_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", userId).eq("visibility_status", "published").order("created_at", { ascending: false }),
                    supabase.from("vehicle_listings").select("id, title, price_brl, description, visibility_status, created_at, vehicle_media(original_storage_path, public_masked_storage_path)").eq("owner_user_id", userId).eq("visibility_status", "published").order("created_at", { ascending: false }),
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
                console.log("[StorePublicPage] products fetched", {
                    storeId, userId,
                    merchant_marketing_products: oldProducts?.length ?? 0,
                    product_listings: pRes.data?.length ?? 0,
                    real_estate_listings: rRes.data?.length ?? 0,
                    vehicle_listings: vRes.data?.length ?? 0,
                    advertiser_listings: advRes.data?.length ?? 0,
                });

                if (pRes.data) {
                    results.push(...pRes.data.map((p: any) => ({
                        id: p.id,
                        title: p.title || "Sem título",
                        short_description: p.description || null,
                        image_url: p.cover_image_url || null,
                        price: p.price || 0,
                        original_price: null,
                        price_label: null,
                        cta_label: "Comprar",
                        tracking_slug: p.id,
                        category: p.category_id || p.category || "Produto",
                        condition: p.condition || "new",
                        is_active: p.is_active ?? true,
                        is_digital: p.is_digital ?? false,
                        is_featured: false,
                        created_at: p.created_at
                    })));
                }

                if (advRes.data) {
                    results.push(...advRes.data.map((p: any) => {
                        const mediaFallback = p.advertiser_listing_media?.[0]?.media_url ?? null;
                        return {
                            id: p.id,
                            title: p.title || "Sem título",
                            short_description: p.description || null,
                            image_url: p.cover_image_url || mediaFallback,
                            price: p.price || 0,
                            original_price: p.original_price || null,
                            price_label: p.price_label || null,
                            cta_label: "Comprar",
                            tracking_slug: p.slug || p.id,
                            category: p.category_id || p.category || "Produto",
                            condition: p.condition || "new",
                            is_active: true,
                            is_digital: p.is_digital ?? false,
                            is_featured: false,
                            created_at: p.created_at
                        };
                    }));
                }

                if (rRes.data) {
                    results.push(...rRes.data.map((r: any) => {
                        let img = null;
                        if (r.real_estate_media?.length > 0) {
                            const m0 = r.real_estate_media[0];
                            const hasMasked = !!m0.public_masked_storage_path && m0.public_masked_storage_path !== m0.original_storage_path;
                            const path = hasMasked ? m0.public_masked_storage_path : m0.original_storage_path;
                            // Fallback pro original tem que buscar no bucket "-original", não "-public".
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
                            cta_label: "Conhecer",
                            tracking_slug: r.id,
                            category: "Imóveis",
                            condition: "used",
                            is_active: true,
                            is_digital: false,
                            is_featured: false,
                            created_at: r.created_at
                        };
                    }));
                }

                if (vRes.data) {
                    results.push(...vRes.data.map((v: any) => {
                        let img = null;
                        if (v.vehicle_media?.length > 0) {
                            const m0 = v.vehicle_media[0];
                            const hasMasked = !!m0.public_masked_storage_path && m0.public_masked_storage_path !== m0.original_storage_path;
                            const path = hasMasked ? m0.public_masked_storage_path : m0.original_storage_path;
                            // Veículos reaproveitam o bucket "real-estate-public"/"real-estate-original"
                            // (não existe bucket "vehicles") — tipo precisa bater com qual path veio.
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
                .select("id, title, price_brl, description, created_at, vehicle_media(original_storage_path, public_masked_storage_path)")
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
                } as StoreProduct & { _kind: string; _ownerStoreId: string | null });
            });

            const { data: properties } = await (supabase.from("real_estate_listings") as any)
                .select("id, title, price_brl, description, created_at, real_estate_media(original_storage_path, public_masked_storage_path)")
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
                } as StoreProduct & { _kind: string; _ownerStoreId: string | null });
            });

            return results
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 12);
        },
        staleTime: 60_000,
        refetchInterval: 60_000,
    });

    const { data: stats } = useQuery({
        queryKey: ["public-store-rating-stats", storeId],
        enabled: !!storeId,
        queryFn: async () => {
            const { data } = await supabase.from("product_rating_stats" as any).select("*").eq("merchant_store_id", storeId);
            return data && data.length > 0 ? {
                average: (data.reduce((acc: number, curr: any) => acc + curr.average_rating, 0) / data.length).toFixed(1),
                count: data.reduce((acc: number, curr: any) => acc + curr.review_count, 0)
            } : null;
        },
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

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
        }
        return res;
    }, [products, search, activeCategory, activeTab]);

    const homeFeatured = useMemo(() => products.filter(p => p.is_featured).slice(0, 6), [products]);
    const homeLatest = platformLatest;

    // Tema visual da loja (merchant_stores.appearance) — sanitizado no load;
    // null = visual padrão da plataforma (nada muda).
    const appearance = useMemo(() => sanitizeAppearance((store as any)?.appearance), [store]);
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
            blueFooterLabel={`Loja: ${store.store_name}`}
            headerChildren={<MarketNavButtons />}
        >
            <StoreThemeScope appearance={appearance}>
            <div className="min-h-screen pb-24">
                
                {/* ─── HEADER PREMIUM ─── */}
                <StoreHeader 
                    store={store} 
                    stats={stats || null}
                    productsCount={products.length}
                    whatsappNumber={paySettings?.store_whatsapp || null}
                    onShare={() => {
                        const url = window.location.href;
                        navigator.share?.({ title: store.store_name, url }).catch(() => {});
                    }}
                    logoUrl={normalizeImageUrl(store.logo_url, 'logos_lojas')}
                    bannerUrl={normalizeImageUrl(store.banner_url)}
                />


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
                                    <HorizontalCarousel cardWidth="w-[260px] sm:w-[280px]" gap="gap-4">
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
                                                    const isImovel = product.category?.toLowerCase() === "imóveis" || product.category?.toLowerCase() === "imoveis" || product.cta_label === "Conhecer";
                                                    navigate(isImovel ? `/imoveis/${product.tracking_slug || product.id}` : `/produto/${product.id}`);
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
                                    <HorizontalCarousel cardWidth="w-[260px] sm:w-[280px]" gap="gap-4">
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
                                                    if (kind === "vehicle") {
                                                        navigate(`/veiculos/${product.tracking_slug || product.id}`);
                                                        return;
                                                    }
                                                    if (kind === "imovel") {
                                                        navigate(`/imoveis/${product.tracking_slug || product.id}`);
                                                        return;
                                                    }
                                                    const ownerStoreId = (product as any)._ownerStoreId;
                                                    if (ownerStoreId) {
                                                        consumeMarketplaceProductClick({
                                                            productId: product.id,
                                                            storeId: ownerStoreId,
                                                            source: "store_page_recem_chegados",
                                                        });
                                                    }
                                                    navigate(`/produto/${product.id}`);
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
                                            const isImovel = product.category?.toLowerCase() === "imóveis" || product.category?.toLowerCase() === "imoveis" || product.cta_label === "Conhecer";
                                            navigate(isImovel ? `/imoveis/${product.tracking_slug || product.id}` : `/produto/${product.id}`);
                                        }}
                                    />
                                ));
                                // Estilo dos produtos definido no tema da loja (grid/cards grandes/
                                // compacto); carrossel = comportamento padrão da plataforma.
                                return productGridClass ? (
                                    <div className={productGridClass}>{cards}</div>
                                ) : (
                                    <HorizontalCarousel cardWidth="w-[260px] sm:w-[280px]" gap="gap-4">
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
                    <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 bg-white px-6 sm:px-9 py-4 sm:py-5 rounded-2xl shadow-lg border border-zinc-100 ring-2 ring-zinc-50 max-w-[95vw]">
                        <div className="flex items-center gap-2.5 shrink-0">
                            <img src="/viagg-logo.png" alt="Viagg-TX8" className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" />
                            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-500 shrink-0" />
                        </div>
                        <div className="flex flex-col text-center sm:text-left leading-snug min-w-0">
                            <span className="font-black uppercase text-[11px] sm:text-sm tracking-[0.1em] text-zinc-900">
                                A Plataforma Apresenta o Produto
                            </span>
                            <span className="mt-0.5 text-[10.5px] sm:text-xs font-medium text-zinc-600 leading-snug">
                                A negociação acontece diretamente entre comprador e vendedor.
                            </span>
                        </div>
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
