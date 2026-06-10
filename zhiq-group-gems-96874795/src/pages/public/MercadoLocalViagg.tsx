import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FooterNeutral } from "@/components/FooterNeutral";
import {
    Search,
    MapPin,
    ShoppingBag,
    Loader2,
    Store,
    Truck,
    Shield,
    Tag,
    Share2,
    LayoutGrid,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    CheckCircle,
    ChevronDown,
    Building2,
    TrendingUp,
    Sparkles,
    Megaphone,
    ArrowRight,
    Gavel,
    Timer,
    X,
    Plus,
    Car,
    Menu,
    SlidersHorizontal,
    MessageCircle,
    Info,
    Percent,
} from "lucide-react";
import { ProductInquiryModal } from "@/components/public/ProductInquiryModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";
import { consumeMarketplaceProductClick } from "@/lib/credits/consumeMarketplaceProductClick";
import LeadCaptureModal from "@/components/public/LeadCaptureModal";
import DiscountRequestModal from "@/components/public/DiscountRequestModal";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";
import { useMarketplaceTracking } from "@/hooks/analytics/useMarketplaceTracking";
import { MarketPropertyCard } from "@/components/real-estate/MarketPropertyCard";
import { MarketVehicleCard } from "@/components/advertiser/MarketVehicleCard";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { useIsAdvertiser } from "@/hooks/useIsAdvertiser";
import { AdvertiserHub } from "@/components/advertiser/AdvertiserHub";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";

// ─── Helpers ────────────────────────────
const STORAGE_BUCKET_CANDIDATES = ['marketing-materials', 'merchant-products', 'product-images', 'merchant-marketing'];

function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('data:')) return trimmed;
    // Try treating as a Supabase Storage path — use first bucket candidate as default
    try {
        const bucket = STORAGE_BUCKET_CANDIDATES[0];
        const { data } = supabase.storage.from(bucket).getPublicUrl(trimmed);
        if (data?.publicUrl) return data.publicUrl;
    } catch { /* noop */ }
    return null;
}

interface CategoriaLoja {
    id: string;
    nome: string;
    icone: string | null;
    created_at: string;
}

// Default emoji map for common category names
const CATEGORY_ICONS: Record<string, string> = {
    "lanches": "🍔", "pizzas": "🍕", "pizza": "🍕", "japonesa": "🍣",
    "marmitas": "🥗", "marmita": "🥗", "bebidas": "🧃", "mercado": "🛒",
    "doces": "🍰", "açaí": "🫐", "sorvetes": "🍦", "pastel": "🩹",
    "churrasco": "🍖", "saudável": "🥦", "vegano": "🥑", "café": "☕",
    "padaria": "🥐", "farmácia": "💊", "pet": "🐾", "flores": "🌻",
    "eletrônicos": "📱", "moda": "👗", "beleza": "💄", "esportes": "⚽",
    "casa": "🏠", "automotivo": "🚗", "brinquedos": "🧸", "livros": "📚",
    "serviços": "🛠️", "artesanato": "🎨", "games": "🎮", "ferramentas": "🔧",
    "informática": "💻", "celulares": "📲", "outros": "📦",
    "alimentos": "🍽️", "alimentos & bebidas": "🍽️",
    "casa & decoração": "🏠", "beleza & saúde": "💄",
    "imóveis": "🏠", "imoveis": "🏠", "terrenos": "🚜",
};

function getCategoryIcon(nome: string, icone: string | null): string {
    if (icone) return icone;
    const key = nome.toLowerCase().trim();
    return CATEGORY_ICONS[key] || "🏷️";
}

// Normalize category keys: strip accents, lowercase, trim, collapse whitespace.
// Ensures "Eletrônicos" and "Eletronicos" are treated as the same category.
function normalizeCategoryKey(value: string): string {
    return (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

interface MarketProduct {
    id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    price_label: string | null;
    cta_label: string | null;
    external_link: string | null;
    created_at: string;
    merchant_store_id: string | null;
    tracking_slug: string | null;
    category?: string | null;
    condition?: string | null;
    store_name?: string;
    store_logo?: string;
    city?: string;
    region?: string;
    /** Real neighborhood from store location */
    neighborhood?: string | null;
    whatsapp?: string | null;
}

const formatPrice = (price: string) => {
    const clean = price.replace(/[^\d.,]/g, "").replace(",", ".");
    const parts = clean.split(".");
    const integer = parts[0] || "0";
    const decimal = (parts[1] || "00").padEnd(2, "0").substring(0, 2);
    return { integer, decimal };
};

// ═══ Auction Countdown ═══
function AuctionCountdown({ endsAt }: { endsAt: string }) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    const diff = Math.max(0, new Date(endsAt).getTime() - now);
    if (diff <= 0) return <span className="text-red-500 font-bold">Encerrado</span>;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return (
        <span className="font-mono font-black tabular-nums">
            {d > 0 && <>{d}d </>}
            {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
    );
}

// ═══════════════════════════════════════
// MERCADO LOCAL VIAGG — Shopee/ML Style
// Products flat, click → store page
// ═══════════════════════════════════════
export default function MercadoLocalViagg() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const viewParam = searchParams.get("view");
    const productsOnly = viewParam === "produtos";
    const [search, setSearch] = useState("");
    const [cityFilter, setCityFilter] = useState<string>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [conditionFilter, setConditionFilter] = useState<"all" | "novo" | "usado">("all");
    const [sortOption, setSortOption] = useState<"recent" | "year" | "brand">("recent");
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [discountProduct, setDiscountProduct] = useState<any>(null);
    const categoryBarRef = useRef<HTMLDivElement>(null);
    const productSectionRef = useRef<HTMLDivElement>(null);
    const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("all");
    const [listingTypeFilter, setListingTypeFilter] = useState<"all" | "leilao" | "arremate">("all");
    // ── Auction modal state ──
const [selectedAuction, setSelectedAuction] = useState<any>(null);
const [auctionModalOpen, setAuctionModalOpen] = useState(false);
// ── Product inquiry modal ("Saber mais") ──
const [inquiryProduct, setInquiryProduct] = useState<any>(null);
const [inquiryOpen, setInquiryOpen] = useState(false);
    const [cartOpen, setCartOpen] = useState(false);
    const globalCart = useGlobalCart();
    const { trackSearch, trackCategoryView } = useMarketplaceTracking();
    const { user } = useAuth();

    // ── Fetch active auction listings ──
    const { data: auctionListings = [] } = useQuery<any[]>({
        queryKey: ["landing-active-auctions"],
        queryFn: async () => {
            const now = new Date().toISOString();
            const { data, error } = await (supabase.from("auction_listings") as any)
                .select("*")
                .eq("status", "active")
                .gte("ends_at", now)
                .lte("starts_at", now)
                .order("ends_at", { ascending: true });
            if (error) { console.error("[Landing] Auctions error:", error); return []; }
            if (!data || data.length === 0) return [];

            // Enrich with city from merchant_stores when auction.city is missing
            const storeIds = [...new Set(data.map((a: any) => a.store_id).filter(Boolean))];
            const cityMap: Record<string, string> = {};

            for (const sid of storeIds) {
                try {
                    const { data: storeRow } = await (supabase.from("merchant_stores") as any)
                        .select("cidade, user_id")
                        .eq("id", sid)
                        .single();
                    if (storeRow?.cidade) {
                        cityMap[sid as string] = storeRow.cidade;
                    } else if (storeRow?.user_id) {
                        const { data: profile } = await (supabase.from("profiles") as any)
                            .select("cidade")
                            .eq("id", storeRow.user_id)
                            .single();
                        if (profile?.cidade) cityMap[sid as string] = profile.cidade;
                    }
                } catch { /* ignore */ }
            }

            return data.map((a: any) => ({
                ...a,
                city: a.city || (a.store_id ? cityMap[a.store_id] : null) || null,
            }));
        },
        refetchInterval: 30000,
    });

    // ── Fetch categories from categorias_loja ──
    const { data: categories = [] } = useQuery<CategoriaLoja[]>({
        queryKey: ["categorias-loja"],
        queryFn: async () => {
            const { data, error } = await (supabase.from("categorias_loja") as any)
                .select("*")
                .order("nome");
            if (error) { console.error("[MercadoLocal] Categories error:", error); return []; }
            return (data || []) as CategoriaLoja[];
        },
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    });

    // ── Fetch all active products + store info (merchant_marketing_products + advertiser_listings) ──
    const { data: products = [], isLoading } = useQuery<MarketProduct[]>({
        queryKey: ["mercado-local-products"],
        queryFn: async () => {
            // 1. Busca produtos da vitrine (merchant_marketing_products)
            const { data: prods, error } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("is_active", true)
                .order("created_at", { ascending: false });

            if (error) console.error("[MercadoLocal] Vitrine query error:", error);

            const vitrineProducts: any[] = prods || [];
            console.log(`[MercadoLocal] Vitrine products: ${vitrineProducts.length}`);

            // 2. Busca anúncios do painel de anunciante (advertiser_listings)
            let advertiserProducts: any[] = [];
            try {
                const { data: advData, error: advErr } = await (supabase.from("advertiser_listings") as any)
                    .select("*, advertiser_listing_media(media_url), advertiser_accounts!inner(user_id)")
                    .in("listing_status", ["active", "published"])
                    .order("created_at", { ascending: false });

                if (advErr) console.error("[MercadoLocal] Advertiser listings error:", advErr);

                if (advData && advData.length > 0) {
                    // Mapeia para o mesmo formato de MarketProduct
                    advertiserProducts = advData.map((item: any) => {
                        const mediaPath = item.advertiser_listing_media?.[0]?.media_url ?? null;
                        let mediaFallback: string | null = null;
                        if (mediaPath) {
                            if (/^https?:\/\//i.test(mediaPath)) {
                                mediaFallback = mediaPath;
                            } else {
                                const { data: pub } = supabase.storage.from('marketing-materials').getPublicUrl(mediaPath);
                                mediaFallback = pub?.publicUrl ?? null;
                            }
                        }
                        return {
                            id: item.id,
                            title: item.title || "Sem título",
                            short_description: item.description || null,
                            image_url: item.cover_image_url || mediaFallback,
                            price_label: item.price ? String(item.price) : null,
                            cta_label: null,
                            external_link: null,
                            created_at: item.created_at,
                            merchant_store_id: null,
                            tracking_slug: null,
                            category: item.category || null,
                            condition: item.condition || null,
                            is_active: true,
                            _advertiser_user_id: item.advertiser_accounts?.user_id || null,
                        };
                    });
                }
                console.log(`[MercadoLocal] Advertiser products: ${advertiserProducts.length}`);
            } catch (err) {
                console.error("[MercadoLocal] Advertiser fetch error:", err);
            }

            // 3. Merge (evitar duplicatas pelo ID)
            const vitrineIds = new Set(vitrineProducts.map((p: any) => p.id));
            const allProducts = [
                ...vitrineProducts,
                ...advertiserProducts.filter((p: any) => !vitrineIds.has(p.id)),
            ];
            console.log(`[MercadoLocal] Total merged products: ${allProducts.length}`);

            if (allProducts.length === 0) return [];

            // 4. Enriquecer com dados da loja
            const storeIds = [...new Set(allProducts.map((p: any) => p.merchant_store_id).filter(Boolean))] as string[];
            const userIds = [...new Set([
                ...allProducts.map((p: any) => p._advertiser_user_id).filter(Boolean),
            ])] as string[];

            const storesMap: Record<string, any> = {};
            const profilesMap: Record<string, any> = {};

            // Buscar lojas
            if (storeIds.length > 0) {
                const { data: stores, error: storesErr } = await (supabase.from("merchant_stores") as any)
                    .select("*")
                    .in("id", storeIds);
                if (storesErr) console.error("[MercadoLocal] Stores error:", storesErr);
                if (stores) {
                    const sUserIds = stores.map((s: any) => s.user_id).filter(Boolean);
                    userIds.push(...sUserIds);
                    stores.forEach((s: any) => { storesMap[s.id] = s; });
                }
            }

            // Buscar profiles (para lojas e anunciantes)
            const uniqueUserIds = [...new Set(userIds)];
            if (uniqueUserIds.length > 0) {
                const { data: profiles } = await (supabase.from("profiles") as any)
                    .select("id, nome_loja, logo_url, cidade, estado, bairro, rua, cep, telefone, whatsapp, full_name, name")
                    .in("id", uniqueUserIds);
                if (profiles) {
                    profiles.forEach((pr: any) => { profilesMap[pr.id] = pr; });
                }
            }

            // Vincular stores com profiles
            Object.values(storesMap).forEach((s: any) => {
                s._profile = profilesMap[s.user_id] || {};
            });

            // Buscar merchant_store_id para anunciantes que não têm
            const advertiserUserIds = advertiserProducts
                .filter((p: any) => !p.merchant_store_id && p._advertiser_user_id)
                .map((p: any) => p._advertiser_user_id);
            const userStoreMap: Record<string, string> = {};
            if (advertiserUserIds.length > 0) {
                const { data: userStores } = await (supabase.from("merchant_stores") as any)
                    .select("id, user_id")
                    .in("user_id", [...new Set(advertiserUserIds)]);
                if (userStores) {
                    userStores.forEach((s: any) => {
                        userStoreMap[s.user_id] = s.id;
                        if (!storesMap[s.id]) storesMap[s.id] = s;
                    });
                }
            }

            return allProducts.map((p: any) => {
                // Para advertiser products, vincular store pelo user_id
                const effectiveStoreId = p.merchant_store_id || (p._advertiser_user_id ? userStoreMap[p._advertiser_user_id] : null);
                const store = storesMap[effectiveStoreId] || {};
                const profile = store._profile || profilesMap[p._advertiser_user_id] || {};
                return {
                    ...p,
                    merchant_store_id: effectiveStoreId || p.merchant_store_id,
                    store_name: store.store_name || store.nome_loja || profile.nome_loja || profile.full_name || profile.name || null,
                    store_logo: store.logo_url || profile.logo_url || null,
                    neighborhood: store.neighborhood || profile.bairro || null,
                    city: p.city || store.city || store.cidade || profile.cidade || null,
                    region: store.region || store.estado || profile.estado || null,
                    whatsapp: store.whatsapp || store.telefone || profile.whatsapp || profile.telefone || null,
                };
            });
        },
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

    // ── Derived data ──
    // ── Fetch real estate listings ──
    const { data: rawPropertyListings = [] } = useQuery<any[]>({
        queryKey: ['public-real-estate'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('public_real_estate_listings' as any)
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // For each property, fetch the first thumbnail
            const propertiesWithMedia = await Promise.all((data as any[]).map(async (prop) => {
                // Fetch the first media item for this property
                const { data: media } = await supabase
                    .from('real_estate_media' as any)
                    .select('original_storage_path, thumb_masked_storage_path')
                    .eq('listing_id', prop.id)
                    .order('sort_order', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                
                let thumbnailUrl = null;
                // Se tiver thumb processada, usa ela. Senão, usa o path original (getListingImageUrl cuida do fallback)
                const storagePath = media?.thumb_masked_storage_path || media?.original_storage_path;
                if (storagePath) {
                    thumbnailUrl = getListingImageUrl(storagePath);
                }
                
                return { ...prop, thumbnail_url: thumbnailUrl };
            }));

            return propertiesWithMedia;
        },
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

    const propertyListings = useMemo(() => {
        return rawPropertyListings.filter(p => {
            if (cityFilter !== "all" && p.city?.trim().toLowerCase() !== cityFilter) return false;
            if (neighborhoodFilter !== "all") {
                const nb = String(p.neighborhood || "").trim().toLowerCase();
                if (nb !== neighborhoodFilter.toLowerCase()) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !p.description?.toLowerCase().includes(q) &&
                    !p.city?.toLowerCase().includes(q) &&
                    !p.neighborhood?.toLowerCase().includes(q) &&
                    !p.property_type?.toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [rawPropertyListings, search, cityFilter, neighborhoodFilter]);

    // ── Fetch vehicle listings ──
    // Query direto em vehicle_listings (anon tem policy vehicle_listings_public_read).
    // A view public_vehicle_listings filtra por visibility_status='published', mas
    // o VehicleForm salva como 'draft' — precisamos incluir todos os status visíveis.
    const { data: rawVehicleListings = [], error: vehicleQueryError, isLoading: vehiclesLoading } = useQuery<any[]>({
        queryKey: ['public-vehicles'],
        queryFn: async () => {
            // Não filtrar por visibility_status — a policy vehicle_listings_public_read
            // já permite leitura pública. Filtragem de status pode ser feita em UI.
            const { data, error } = await supabase
                .from('vehicle_listings' as any)
                .select('*')
                .order('created_at', { ascending: false });

            console.log('[MercadoLocalViagg] vehicle_listings result:', { count: data?.length || 0, error, sample: data?.[0] });

            if (error) {
                console.error('[MercadoLocalViagg] vehicle_listings query error:', error);
                return [];
            }

            const rows = (data as any[]) || [];
            if (rows.length === 0) return [];

            // Buscar mídias em uma única query
            const ids = rows.map(v => v.id);
            const { data: mediaRows } = await supabase
                .from('vehicle_media' as any)
                .select('listing_id, original_storage_path, public_masked_storage_path, sort_order')
                .in('listing_id', ids)
                .order('sort_order', { ascending: true });

            const mediaMap = new Map<string, string>();
            for (const row of (mediaRows as any[]) || []) {
                if (!mediaMap.has(row.listing_id)) {
                    const p = row.public_masked_storage_path || row.original_storage_path;
                    if (p) {
                        mediaMap.set(
                            row.listing_id,
                            p.startsWith('http')
                                ? p
                                : supabase.storage.from('real-estate-original').getPublicUrl(p).data.publicUrl
                        );
                    }
                }
            }

            return rows.map((v: any) => ({
                ...v,
                thumbnail_url: mediaMap.get(v.id) || null,
            }));
        },
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

    const vehicleListings = useMemo(() => {
        return rawVehicleListings.filter(p => {
            if (cityFilter !== "all" && p.city?.trim().toLowerCase() !== cityFilter) return false;
            if (neighborhoodFilter !== "all") {
                const nb = String(p.neighborhood || "").trim().toLowerCase();
                if (nb !== neighborhoodFilter.toLowerCase()) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !p.title?.toLowerCase().includes(q) &&
                    !p.city?.toLowerCase().includes(q) &&
                    !p.neighborhood?.toLowerCase().includes(q) &&
                    !p.brand?.toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [rawVehicleListings, search, cityFilter, neighborhoodFilter]);

    const cities = useMemo(() => {
        const seen = new Map<string, string>(); // key (lowercase) -> first raw value
        
        // Cities from products
        products.forEach(p => {
            if (p.city) {
                const key = p.city.trim().toLowerCase();
                if (!seen.has(key)) seen.set(key, p.city.trim());
            }
        });

        // Cities from real estate
        rawPropertyListings.forEach(p => {
            if (p.city) {
                const key = p.city.trim().toLowerCase();
                if (!seen.has(key)) seen.set(key, p.city.trim());
            }
        });

        // Cities from vehicles
        rawVehicleListings.forEach(p => {
            if (p.city) {
                const key = p.city.trim().toLowerCase();
                if (!seen.has(key)) seen.set(key, p.city.trim());
            }
        });

        return [...seen.entries()]
            .map(([key, raw]) => ({
                key,
                label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [products, rawPropertyListings, rawVehicleListings]);

    // ── Active categories: only those with at least one product ──
    const activeCategories = useMemo(() => {
        // Aggregate product counts by normalized key (accent/case-insensitive),
        // keeping the "best" display label seen so far for each key.
        const bucket = new Map<string, { label: string; count: number }>();
        products.forEach(p => {
            const raw = String(p.category || "").trim();
            if (!raw) return;
            const key = normalizeCategoryKey(raw);
            if (!key) return;
            const prev = bucket.get(key);
            if (prev) {
                prev.count += 1;
                // Prefer a label that has accents/uppercase over a plain lowercase one
                if (raw !== raw.toLowerCase() && prev.label === prev.label.toLowerCase()) {
                    prev.label = raw;
                }
            } else {
                bucket.set(key, { label: raw, count: 1 });
            }
        });

        // Merge with categorias_loja: when a registered category matches a product
        // bucket key, adopt the registered (canonical) name and icon.
        const matched: Array<CategoriaLoja & { count: number }> = [];
        const consumedKeys = new Set<string>();
        categories.forEach(c => {
            const key = normalizeCategoryKey(c.nome);
            if (bucket.has(key)) {
                matched.push({
                    ...c,
                    count: bucket.get(key)!.count,
                });
                consumedKeys.add(key);
            }
        });

        // Remaining buckets = product categories not present in categorias_loja
        const extras: Array<CategoriaLoja & { count: number }> = [];
        bucket.forEach((val, key) => {
            if (consumedKeys.has(key)) return;
            const label = val.label;
            extras.push({
                id: `extra-${key}`,
                nome: label.charAt(0).toUpperCase() + label.slice(1),
                icone: null,
                created_at: "",
                count: val.count,
            });
        });

        // Add "Imóveis" category if there are properties
        if (rawPropertyListings.length > 0) {
            extras.push({
                id: 'cat-imoveis',
                nome: 'Imóveis',
                icone: '🏠',
                created_at: '',
                count: rawPropertyListings.length,
            });
        }

        // Add "Automóveis" category if there are vehicles
        if (rawVehicleListings.length > 0) {
            extras.push({
                id: 'cat-automoveis',
                nome: 'Automóveis',
                icone: '🚗',
                created_at: '',
                count: rawVehicleListings.length,
            });
        }

        return [...matched, ...extras].sort((a, b) => b.count - a.count);
    }, [categories, products, rawPropertyListings, rawVehicleListings]);

    const filtered = useMemo(() => {
        return products.filter(p => {
            if (cityFilter !== "all" && p.city?.trim().toLowerCase() !== cityFilter) return false;
            if (categoryFilter !== "all") {
                const pCat = (p.category || "").toLowerCase().trim();
                const fCat = categoryFilter.toLowerCase().trim();
                if (pCat !== fCat) return false;
            }
            if (conditionFilter !== "all") {
                const cond = (p.condition || "").toLowerCase();
                const isNovo = ["novo", "novos", "new"].some(v => cond.includes(v));
                const isUsado = ["usado", "usados", "used"].some(v => cond.includes(v));
                if (conditionFilter === "novo" && !isNovo) return false;
                if (conditionFilter === "usado" && !isUsado) return false;
            }
            if (neighborhoodFilter !== "all") {
                const nb = String(p.neighborhood || "").trim().toLowerCase();
                if (nb !== neighborhoodFilter.toLowerCase()) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !p.title.toLowerCase().includes(q) &&
                    !(p.short_description || "").toLowerCase().includes(q) &&
                    !(p.store_name || "").toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [products, search, cityFilter, categoryFilter, conditionFilter, neighborhoodFilter, listingTypeFilter]);

    // ── Category bar scroll helpers ──
    const scrollCategoryBar = (dir: "left" | "right") => {
        if (!categoryBarRef.current) return;
        categoryBarRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
    };

    // ── Neighborhood list ──
    const availableNeighborhoods = useMemo(() => {
        const toEntry = (raw: string) => ({
            key: raw.trim().toLowerCase(),
            label: raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase(),
        });
        const dedup = (items: string[]) => {
            const seen = new Map<string, string>(); // key -> first raw
            items.forEach(raw => {
                const k = raw.trim().toLowerCase();
                if (k && !seen.has(k)) seen.set(k, raw.trim());
            });
            return [...seen.entries()]
                .map(([key, raw]) => toEntry(raw))
                .sort((a, b) => a.label.localeCompare(b.label));
        };
        // Neighborhoods from products
        const productsNeighborhoods = products.map(p => String(p.neighborhood || "")).filter(Boolean);
        // Neighborhoods from real estate
        const propertyNeighborhoods = rawPropertyListings.map(p => String(p.neighborhood || "")).filter(Boolean);
        // Neighborhoods from vehicles
        const vehicleNeighborhoods = rawVehicleListings.map(p => String(p.neighborhood || "")).filter(Boolean);
        
        const allNeighborhoods = [...productsNeighborhoods, ...propertyNeighborhoods, ...vehicleNeighborhoods];

        // If a city filter is active, keep only neighborhoods from that city
        if (cityFilter !== "all") {
            const prodNbs = products
                .filter(p => (p.city?.trim().toLowerCase() ?? "") === cityFilter)
                .map(p => String(p.neighborhood || ""))
                .filter(Boolean);
            const propNbs = rawPropertyListings
                .filter(p => (p.city?.trim().toLowerCase() ?? "") === cityFilter)
                .map(p => String(p.neighborhood || ""))
                .filter(Boolean);
            const vehicNbs = rawVehicleListings
                .filter(p => (p.city?.trim().toLowerCase() ?? "") === cityFilter)
                .map(p => String(p.neighborhood || ""))
                .filter(Boolean);
            return dedup([...prodNbs, ...propNbs, ...vehicNbs]);
        }
        return dedup(allNeighborhoods);
    }, [products, rawPropertyListings, rawVehicleListings, cityFilter]);

    useEffect(() => {
        // Reset filter when selected neighborhood no longer exists for the current city
        if (neighborhoodFilter !== "all") {
            const inProducts = products.some(p => {
                const nb = String(p.neighborhood || "").trim().toLowerCase();
                const city = (p.city?.trim().toLowerCase() ?? "");
                return (cityFilter === "all" || city === cityFilter) && nb === neighborhoodFilter.toLowerCase();
            });
            const inProperties = rawPropertyListings.some(p => {
                const nb = String(p.neighborhood || "").trim().toLowerCase();
                const city = (p.city?.trim().toLowerCase() ?? "");
                return (cityFilter === "all" || city === cityFilter) && nb === neighborhoodFilter.toLowerCase();
            });
            const inVehicles = rawVehicleListings.some(p => {
                const nb = String(p.neighborhood || "").trim().toLowerCase();
                const city = (p.city?.trim().toLowerCase() ?? "");
                return (cityFilter === "all" || city === cityFilter) && nb === neighborhoodFilter.toLowerCase();
            });
            if (!inProducts && !inProperties && !inVehicles) setNeighborhoodFilter("all");
        }
    }, [cityFilter, neighborhoodFilter, products, rawPropertyListings, rawVehicleListings]);

const scrollToProducts = () => {
        setTimeout(() => {
            productSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
    };

    const storeCount = useMemo(() => {
        return new Set(products.map(p => p.merchant_store_id).filter(Boolean)).size;
    }, [products]);

    const { isAdvertiser, isLoading: advertiserLoading } = useIsAdvertiser();

    // ── View impression tracking (IntersectionObserver) ──
    const gridRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!gridRef.current || filtered.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const el = entry.target as HTMLElement;
                        const productId = el.dataset.productId;
                        if (productId) {
                            trackProductEvent({
                                product_id: productId,
                                store_id: el.dataset.storeId || null,
                                event_type: "view",
                                city: el.dataset.city || null,
                                source: "landing",
                            });
                            observer.unobserve(el); // Only track once per card
                        }
                    }
                }
            },
            { threshold: 0.5 }
        );

        const cards = gridRef.current.querySelectorAll("[data-product-id]");
        cards.forEach((card) => observer.observe(card));

        return () => observer.disconnect();
    }, [filtered]);

    // ── Marketplace Tracking (Search & Categories) ──
    useEffect(() => {
        if (search.trim().length >= 2) {
            trackSearch(search, categoryFilter !== "all" ? categoryFilter : null, {
                source: "marketplace_search_bar",
                page: window.location.pathname,
                city: cityFilter !== "all" ? cityFilter : null,
                neighborhood: neighborhoodFilter !== "all" ? neighborhoodFilter : null,
                results_count: filtered.length
            });
        }
    }, [search, categoryFilter, cityFilter, neighborhoodFilter, trackSearch, filtered.length]);

    useEffect(() => {
        if (categoryFilter !== "all") {
            const categoryObj = activeCategories.find(c => c.nome === categoryFilter);
            trackCategoryView(categoryFilter, {
                source: "category_filter",
                page: window.location.pathname,
                category_name: categoryObj?.nome || categoryFilter,
                city: cityFilter !== "all" ? cityFilter : null,
                neighborhood: neighborhoodFilter !== "all" ? neighborhoodFilter : null
            });
        }
    }, [categoryFilter, cityFilter, neighborhoodFilter, trackCategoryView, activeCategories]);

    return (
        <MarketLayout
            search={search}
            setSearch={setSearch}
            showSearch={!isAdvertiser}
            headerRight={null}
        >
            {isAdvertiser ? (
                <div className="bg-[#F5E62B] min-h-[70vh]">
                    <AdvertiserHub />
                </div>
            ) : (
                <>
                <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-6 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1.5 font-medium">
                        <Truck className="h-3.5 w-3.5 text-[#FF6A00]" /> Entrega Local
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                        <Shield className="h-3.5 w-3.5 text-green-500" /> Comerciantes Verificados
                    </span>
                    <span className="flex items-center gap-1.5 font-medium hidden sm:flex">
                        <Tag className="h-3.5 w-3.5 text-blue-500" /> Melhores Preços
                    </span>
                </div>

                <InstitutionalSafetyBanner />

            {/* ═══ REAL ESTATE SECTION (ocultada) ═══ */}
            {false && !productsOnly && (categoryFilter === "all" || categoryFilter === "Imóveis") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-white">
                    <div className="max-w-[1920px] mx-auto space-y-10">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Building2 className="w-5 h-5 text-primary" />
                                    </div>
                                    <span className="text-xs font-black text-primary uppercase tracking-widest">Oportunidades Locais</span>
                                </div>
                                <h2 className="text-4xl font-black text-zinc-900 tracking-tighter">IMÓVEIS EM DESTAQUE</h2>
                                <p className="text-zinc-500 font-medium max-w-xl">
                                    Explore terrenos, chácaras e sítios com proteção total de dados e negociação inteligente.
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                className="rounded-2xl font-bold border-zinc-200 hover:bg-zinc-50 gap-2 h-12"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('viagg-close-cart'));
                                    if (propertyListings.length > 0) window.open('/imoveis', '_blank');
                                    else window.open('/auth?entry=advertiser', '_blank');
                                }}
                            >
                                {propertyListings.length > 0 ? 'Ver todos os imóveis' : 'Anunciar meu imóvel'}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {propertyListings.length > 0 ? (
                                propertyListings.slice(0, 8).map((prop) => (
                                    <MarketPropertyCard key={prop.id} property={prop} />
                                ))
                            ) : (
                                <div 
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="col-span-1 border-2 border-dashed border-zinc-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-orange-200 hover:bg-orange-50/20 transition-all cursor-pointer group"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-[#FF6A00] transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie seu imóvel aqui e alcance milhares de compradores.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ AUTOMOTIVE SECTION (ocultada) ═══ */}
            {false && !productsOnly && (categoryFilter === "all" || categoryFilter === "Automóveis") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-blue-50/50">
                    <div className="max-w-[1920px] mx-auto space-y-10">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-500/10 rounded-lg">
                                        <Car className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <span className="text-xs font-black text-blue-500 uppercase tracking-widest">Motor & Potência</span>
                                </div>
                                <h2 className="text-4xl font-black text-zinc-900 tracking-tighter">AUTOMÓVEIS EM DESTAQUE</h2>
                                <p className="text-zinc-500 font-medium max-w-xl">
                                    Carros, motos e utilitários. Avaliados e prontos para rodar, com contato direto com o vendedor.
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                className="rounded-2xl font-bold border-zinc-200 hover:bg-zinc-50 gap-2 h-12"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('viagg-close-cart'));
                                    if (vehicleListings.length > 0) window.open('/veiculos', '_blank');
                                    else window.open('/auth?entry=advertiser', '_blank');
                                }}
                            >
                                {vehicleListings.length > 0 ? 'Ver todos os veículos' : 'Anunciar meu veículo'}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                            {vehicleListings.length > 0 ? (
                                vehicleListings.slice(0, 8).map((veh) => (
                                    <MarketVehicleCard key={veh.id} vehicle={veh} />
                                ))
                            ) : (
                                <div 
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="col-span-1 border-2 border-dashed border-blue-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-blue-200 hover:bg-blue-50/20 transition-all cursor-pointer group"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-blue-500 transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie seu veículo aqui e negocie mais rápido.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ REAL ESTATE MODULE PROMO ═══ */}
            <div className="max-w-[1920px] mx-auto px-4 lg:px-6 mt-4">
                <div 
                    className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-zinc-900 to-zinc-800 p-6 md:p-10 border border-white/10 shadow-xl group cursor-pointer"
                    onClick={() => {
                        supabase.from('analytics_events' as any).insert({ 
                            event_name: 'market_sell_cta_clicked', 
                            user_id: user?.id || null, 
                            metadata: { position: 'hero_banner' } 
                        } as any);
                        if (user) {
                          localStorage.setItem("viagg_auth_entry", "advertiser");
                          navigate("/anunciante/painel");
                        } else {
                          navigate("/auth");
                        }
                    }}
                >
                    {/* Background glow */}
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-[#FF6A00]/20 rounded-full blur-[80px] animate-pulse" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex-1 space-y-3 text-center md:text-left">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-[10px] font-black uppercase tracking-widest">
                                <Sparkles className="w-3 h-3" />
                                Seja um Parceiro Viagg
                            </div>
                            <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter leading-tight">
                                ANUNCIE SEUS PRODUTOS E ALCANCE <br />
                                <span className="text-[#FF6A00]">COMPRADORES DA SUA REGIÃO</span>
                            </h2>
                        </div>
                        <div className="shrink-0">
                           <div className="bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xl px-10 py-5 rounded-2xl shadow-2xl transition-all flex items-center justify-center text-center gap-3 group-hover:scale-105">
                                <Megaphone className="w-6 h-6 shrink-0 group-hover:rotate-12 transition-transform" />
                                <span className="leading-tight">QUERO<br />VENDER</span>
                           </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ CATEGORY BAR ═══ */}
            {activeCategories.length > 0 && (
                <div className="bg-white border-b border-gray-100 shadow-sm">
                    <div className="w-full px-4 lg:px-6 relative">
                        <button
                            type="button"
                            aria-label="Categorias anteriores"
                            onClick={() => scrollCategoryBar("left")}
                            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-orange-100 flex items-center justify-center hover:bg-orange-50 active:scale-95 transition-all">
                            <ChevronLeft className="h-5 w-5 text-[#FF6A00]" />
                        </button>
                        <button
                            type="button"
                            aria-label="Próximas categorias"
                            onClick={() => scrollCategoryBar("right")}
                            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-orange-100 flex items-center justify-center hover:bg-orange-50 active:scale-95 transition-all">
                            <ChevronRight className="h-5 w-5 text-[#FF6A00]" />
                        </button>

                        <div ref={categoryBarRef}
                            className="flex items-center gap-1 py-3 overflow-x-auto scrollbar-hide scroll-smooth px-10">
                            <button
                                onClick={() => { setCategoryFilter("all"); scrollToProducts(); }}
                                className={cn(
                                    "flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[72px] transition-all duration-200 shrink-0",
                                    categoryFilter === "all"
                                        ? "bg-[#FF6A00] text-white shadow-md shadow-orange-200 scale-105"
                                        : "bg-gray-50 text-gray-500 hover:bg-orange-50 hover:text-[#FF6A00]"
                                )}>
                                <span className="text-3xl"><LayoutGrid className="h-9 w-9" /></span>
                                <span className="text-[10px] font-bold whitespace-nowrap">Todos</span>
                            </button>

                            {activeCategories.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => { setCategoryFilter(cat.nome); scrollToProducts(); }}
                                    className={cn(
                                        "flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[72px] transition-all duration-200 shrink-0 relative",
                                        categoryFilter === cat.nome
                                            ? "bg-[#FF6A00] text-white shadow-md shadow-orange-200 scale-105"
                                            : "bg-gray-50 text-gray-500 hover:bg-orange-50 hover:text-[#FF6A00]"
                                    )}>
                                    <span className="text-3xl">{getCategoryIcon(cat.nome, cat.icone)}</span>
                                    <span className="text-[10px] font-bold whitespace-nowrap">{cat.nome}</span>
                                    <span className={cn(
                                        "absolute -top-1 -right-1 text-[8px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1",
                                        categoryFilter === cat.nome
                                            ? "bg-white text-[#FF6A00]"
                                            : "bg-[#FF6A00] text-white"
                                    )}>
                                        {cat.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ ACTIVE AUCTIONS SECTION ═══ */}
            {auctionListings.filter((a: any) => {
                if (listingTypeFilter === "all") return true;
                const lt = String(a.listing_type || "").toLowerCase().trim();
                if (listingTypeFilter === "leilao") return lt === "auction" || lt === "leilao" || lt === "leilão" || lt === "";
                if (listingTypeFilter === "arremate") return lt === "arremate";
                return true;
            }).length > 0 && (
                <div style={{ backgroundColor: '#F5E62B' }}>
                    <div className="w-full px-4 lg:px-6 pt-6 pb-2">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-sm">
                                <Gavel className="h-4 w-4 text-white" />
                            </div>
                            <h2 className="text-lg font-black text-gray-800">🔥 Leilões Ativos</h2>
                            <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">AO VIVO</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {auctionListings.filter((a: any) => {
                                if (listingTypeFilter === "all") return true;
                                const lt = String(a.listing_type || "").toLowerCase().trim();
                                if (listingTypeFilter === "leilao") return lt === "auction" || lt === "leilao" || lt === "leilão" || lt === "";
                                if (listingTypeFilter === "arremate") return lt === "arremate";
                                return true;
                            }).map((auction: any) => {
                                const imgSrc = normalizeImageUrl(auction.product_image_url);
                                const isAuction = auction.listing_type !== "arremate";
                                return (
                                    <div
                                        key={auction.id}
                                        className="rounded-2xl overflow-hidden bg-white border-2 border-orange-200 shadow-lg hover:shadow-xl transition-all cursor-pointer group flex flex-col h-full"
                                        onClick={() => { setSelectedAuction(auction); setAuctionModalOpen(true); }}
                                    >
                                        {/* Image + type badge */}
                                        <div className="relative">
                                            {imgSrc ? (
                                                <div className="aspect-square bg-gray-50 overflow-hidden">
                                                    <img src={imgSrc} alt={auction.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                </div>
                                            ) : (
                                                <div className="aspect-square bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
                                                    <Gavel className="h-12 w-12 text-orange-200" />
                                                </div>
                                            )}
                                            {/* Type badge */}
                                            <span className={`absolute top-2 left-2 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full shadow-md ${
                                                isAuction
                                                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                                                    : "bg-gradient-to-r from-violet-500 to-purple-500 text-white"
                                            }`}>
                                                {isAuction ? "🔨 Leilão" : "⚡ Arremate"}
                                            </span>
                                            {/* Countdown badge */}
                                            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/75 text-white text-sm px-3.5 py-2 rounded-xl backdrop-blur-sm">
                                                <Timer className="h-4 w-4 text-red-400 animate-pulse" />
                                                <AuctionCountdown endsAt={auction.ends_at} />
                                            </div>
                                        </div>
                                        {/* Info */}
                                        <div className="p-4 space-y-2.5 flex-1 flex flex-col">
                                            <h3 className="font-bold text-sm text-gray-800 line-clamp-2 leading-snug min-h-[40px]">{auction.title}</h3>



                                            {/* Description */}
                                            {auction.description && (
                                                <p className="text-[12px] text-gray-400 line-clamp-2 leading-relaxed">{auction.description}</p>
                                            )}

                                            {/* Prices */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="bg-gray-50 rounded-lg p-2 text-center">
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase">{isAuction ? "Lance atual" : "Preço"}</p>
                                                    <p className="text-lg font-black text-orange-600">
                                                        R$ {(auction.current_bid || auction.starting_bid || 0).toFixed(2).replace(".", ",")}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50 rounded-lg p-2 text-center">
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase">Lance inicial</p>
                                                    <p className="text-lg font-black text-gray-600">
                                                        R$ {(auction.starting_bid || 0).toFixed(2).replace(".", ",")}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Dates */}
                                            <div className="flex items-center gap-2 text-[10px] bg-gray-50 rounded-lg px-3 py-2">
                                                <div className="flex-1">
                                                    <span className="text-gray-400 font-bold uppercase">Início </span>
                                                    <span className="font-semibold text-gray-600">
                                                        {auction.starts_at ? new Date(auction.starts_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : auction.created_at ? new Date(auction.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                                    </span>
                                                </div>
                                                <div className="w-px h-3 bg-gray-200" />
                                                <div className="flex-1">
                                                    <span className="text-gray-400 font-bold uppercase">Término </span>
                                                    <span className="font-semibold text-gray-600">
                                                        {auction.ends_at ? new Date(auction.ends_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-auto space-y-2.5">
                                                {/* Store Location + Google Maps */}
                                                <div className="space-y-1.5 pt-2 border-t border-gray-50">
                                                    {auction.city && (
                                                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                                            <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                                                            <span className="font-semibold truncate">{auction.city}</span>
                                                        </div>
                                                    )}
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(auction.city || auction.title || 'loja')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-all"
                                                    >
                                                        <MapPin className="h-3.5 w-3.5" />
                                                        📍 Ver no Mapa
                                                    </a>
                                                </div>

                                                {/* CTA */}
                                                <button
                                                    onClick={() => { setSelectedAuction(auction); setAuctionModalOpen(true); }}
                                                    className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-sm hover:shadow-md ${
                                                        isAuction
                                                            ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                                                            : "bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
                                                    }`}
                                                >
                                                    {isAuction ? "🔨 Dar Lance" : "⚡ Fazer Oferta"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
{auctionModalOpen && selectedAuction && (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm transition-all duration-300">
        <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-orange-100 flex flex-col relative animate-in fade-in zoom-in duration-300">
            {/* Header / Dismiss */}
            <button
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-all shadow-sm"
                onClick={() => setAuctionModalOpen(false)}
            >
                <X className="h-5 w-5" />
            </button>

            {/* Content Container */}
            <div className="overflow-y-auto max-h-[90vh]">
                {/* Image Section */}
                <div className="relative aspect-video bg-gray-50 overflow-hidden">
                    {selectedAuction.product_image_url ? (
                        <img
                            src={normalizeImageUrl(selectedAuction.product_image_url)!}
                            alt={selectedAuction.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50">
                            <Gavel className="h-16 w-16 text-orange-200" />
                        </div>
                    )}
                    {/* Status Badge */}
                    <div className="absolute bottom-4 left-4 flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg border border-white/20 ${
                            selectedAuction.listing_type === "arremate"
                                ? "bg-violet-500 text-white"
                                : "bg-orange-500 text-white"
                        }`}>
                            {selectedAuction.listing_type === "arremate" ? "⚡ Arremate" : "🔨 Leilão Ativo"}
                        </span>
                        <div className="flex items-center gap-1.5 bg-black/70 text-white text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
                            <Timer className="h-3.5 w-3.5 text-red-400 animate-pulse" />
                            <AuctionCountdown endsAt={selectedAuction.ends_at} />
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Title & Store */}
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black text-gray-900 leading-tight">{selectedAuction.title}</h2>
                        {selectedAuction.store_name && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                                <Store className="h-4 w-4 text-orange-400" />
                                <span>{selectedAuction.store_name}</span>
                                {selectedAuction.city && (
                                    <>
                                        <span className="text-gray-300">•</span>
                                        <span className="flex items-center gap-0.5"><MapPin className="h-3.5 w-3.5" /> {selectedAuction.city}</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 shadow-sm">
                            <p className="text-[10px] text-orange-400 font-black uppercase tracking-wider mb-1">
                                {selectedAuction.listing_type === "arremate" ? "Preço de Arremate" : "Lance Atual"}
                            </p>
                            <p className="text-2xl font-black text-orange-600">
                                R$ {(selectedAuction.current_bid || selectedAuction.starting_bid || 0).toFixed(2).replace(".", ",")}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shadow-sm">
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider mb-1">Lance Inicial</p>
                            <p className="text-2xl font-black text-gray-700">
                                R$ {(selectedAuction.starting_bid || 0).toFixed(2).replace(".", ",")}
                            </p>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center justify-between px-2 py-4 border-y border-gray-100">
                        <div className="flex items-center gap-4">
                            <div className="text-center">
                                <p className="text-sm font-black text-gray-800">{selectedAuction.total_bids || 0}</p>
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Lances</p>
                            </div>
                            <div className="w-px h-6 bg-gray-100" />
                            <div className="text-center">
                                <p className="text-sm font-black text-gray-800">{selectedAuction.watchers_count || 0}</p>
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Observando</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">📅 Encerra em</p>
                            <p className="text-xs font-black text-gray-700">
                                {new Date(selectedAuction.ends_at).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>

                    {/* Description */}
                    {selectedAuction.description && (
                        <div className="space-y-2">
                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Descrição detalhada</h4>
                            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/50 rounded-xl p-4 border border-gray-50">
                                {selectedAuction.description}
                            </p>
                        </div>
                    )}

                    {/* CTA Section */}
                    <div className="flex flex-col gap-3 pt-2 pb-4">
                        <button
                            onClick={() => {
                                setAuctionModalOpen(false);
                                const targetPath = selectedAuction.listing_type === "arremate" 
                                    ? `/arremate/${selectedAuction.id}` 
                                    : `/leilao/${selectedAuction.id}`;
                                navigate(targetPath);
                            }}
                            className="w-full h-14 bg-[#FF6A00] hover:bg-[#e65c00] text-white rounded-2xl font-black text-base shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Gavel className="h-5 w-5" />
                            {selectedAuction.listing_type === "arremate" ? "Dar Oferta / Arrematar" : "Ver Detalhes & Dar Lance"}
                        </button>
                        
                        <button
                            onClick={() => setAuctionModalOpen(false)}
                            className="w-full h-12 bg-white text-gray-400 hover:text-gray-600 rounded-xl font-bold text-sm transition-colors border border-transparent hover:border-gray-100"
                        >
                            Voltar para o Mercado
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
)}
            {/* ═══ PRODUCT GRID (flat, individual cards) ═══ */}
            <div className="flex-1" style={{ backgroundColor: '#F5E62B' }}>
            <div ref={productSectionRef} className="w-full px-4 lg:px-6 py-6">

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="text-center space-y-3">
                            <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mx-auto" />
                            <p className="text-sm text-gray-400">Carregando produtos...</p>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl shadow-sm">
                        <ShoppingBag className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-gray-600">Nenhum produto encontrado</h2>
                        <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
                            {search ? `Nenhum resultado para "${search}"` : "Os comerciantes ainda não publicaram produtos."}
                        </p>
                    </div>
                ) : (
                  <div>
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                      Produtos {conditionFilter === "all" ? "Todos" : conditionFilter === "novo" ? "Novos" : "Usados"}
                    </h2>
                    <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {filtered
                            .flatMap(product => {
                                const matched = auctionListings.filter((a: any) => 
                                    a.product_id === product.id ||
                                    a.title === product.title ||
                                    (a.title?.toLowerCase().includes(product.title?.toLowerCase()) && product.title?.length > 5)
                                );
                                if (matched.length === 0) return [{ product, matchedAuction: null }];
                                return matched.map(auction => ({ product, matchedAuction: auction }));
                            })
                            .sort((a, b) => {
                                if (a.matchedAuction && !b.matchedAuction) return -1;
                                if (!a.matchedAuction && b.matchedAuction) return 1;
                                return 0;
                            })
                            .map(({ product, matchedAuction }) => {
                            const imgSrc = normalizeImageUrl(product.image_url);
                            const price = product.price_label ? formatPrice(product.price_label) : null;

                            return (
                                <div key={matchedAuction ? `${product.id}-${matchedAuction.id}` : product.id}
                                    className="rounded-lg overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 bg-white border border-gray-100 group/card flex flex-col h-full"
                                    onClick={() => {
                                        trackProductEvent({
                                            product_id: product.id,
                                            store_id: product.merchant_store_id,
                                            event_type: "click",
                                            city: product.city,
                                            source: "landing",
                                        });
                                        if (product.merchant_store_id) {
                                            consumeMarketplaceProductClick({
                                                productId: product.id,
                                                storeId: product.merchant_store_id,
                                                city: product.city,
                                                neighborhood: product.neighborhood,
                                                source: "card",
                                            });
                                        }
                                        if (product.merchant_store_id) {
                                            navigate(`/loja/${product.merchant_store_id}`);
                                        } else if (product.tracking_slug) {
                                            navigate(`/p/${product.tracking_slug}`);
                                        } else {
                                            navigate(`/produto/${product.id}`);
                                        }
                                    }}>

                                    {/* Image */}
                                    <div className="relative overflow-hidden bg-gray-50">
                                        {/* Condition Badge */}
                                        {product.condition && (
                                            <div className="absolute top-2 left-2 z-10">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                                                    product.condition.toLowerCase().includes('novo') 
                                                    ? 'bg-emerald-500 text-white' 
                                                    : 'bg-amber-500 text-white'
                                                }`}>
                                                    {product.condition}
                                                </span>
                                            </div>
                                        )}
                                        {imgSrc ? (
                                            <div className="relative w-full aspect-square flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                                                <ShoppingBag className="absolute h-8 w-8 text-gray-200 z-0" />
                                                <img src={imgSrc} alt={product.title}
                                                    className="absolute inset-0 w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300 z-10"
                                                    onLoad={(e) => {
                                                        const el = e.currentTarget;
                                                        console.log(`[MercadoLocal] Imagem do Produto Carregada com SUCESSO!
- Produto: ${product.title}
- naturalWidth: ${el.naturalWidth}px
- naturalHeight: ${el.naturalHeight}px
- URL exibida: ${el.currentSrc || el.src}`);
                                                    }}
                                                    onError={async (e) => {
                                                        const el = e.currentTarget;
                                                        console.error(`[MercadoLocal] Imagem FALHOU ao carregar nativamente pelo IMG Tag!
- Produto: ${product.title}
- URL Original que falhou: ${imgSrc}`);
                                                        if (el.dataset.retried) { 
                                                            console.warn(`[MercadoLocal] URL já havia sido processada no fallback. Escondendo o frame para revelar a ShoppingBag.`);
                                                            el.style.opacity = "0"; 
                                                            return; 
                                                        }
                                                        el.dataset.retried = "1";
                                                        try {
                                                            console.log(`[MercadoLocal] Iniciando fetch manual para diagnosticar a Imagem de URL: ${imgSrc}`);
                                                            const res = await fetch(imgSrc);
                                                            console.log(`[MercadoLocal] Resposta originada pelo Fetch: Status ${res.status} | Content-Type -> ${res.headers.get('content-type')}`);
                                                            if (!res.ok) { 
                                                                console.error(`[MercadoLocal] Resposta do Fetch foi um Erro HTTP (${res.status}). Abortando.`);
                                                                el.style.opacity = "0"; 
                                                                return; 
                                                            }
                                                            const blob = await res.blob();
                                                            console.log(`[MercadoLocal] Blob baixado pelo Fetch: Type "${blob.type}" | Size ${blob.size} bytes`);
                                                            
                                                            const fixedBlob = blob.type.startsWith('image/')
                                                                ? blob
                                                                : new Blob([blob], { type: 'image/jpeg' });
                                                            const objectUrl = URL.createObjectURL(fixedBlob);
                                                            console.log(`[MercadoLocal] Blob convertido e injetado via ObjectURL: ${objectUrl}`);    
                                                            el.src = objectUrl;
                                                        } catch (err) {
                                                            console.error(`[MercadoLocal] O Fetch falhou (possivel problema de CORS ou rede):`, err);
                                                            el.style.opacity = "0";
                                                        }
                                                    }} />
                                            </div>
                                        ) : (() => {
                                            const initial = (product.title?.trim()[0] || "?").toUpperCase();
                                            const palette = [
                                                "from-orange-400 to-pink-500",
                                                "from-blue-400 to-indigo-500",
                                                "from-emerald-400 to-teal-500",
                                                "from-purple-400 to-fuchsia-500",
                                                "from-amber-400 to-orange-500",
                                                "from-rose-400 to-red-500",
                                                "from-cyan-400 to-blue-500",
                                            ];
                                            const idx = (product.id?.charCodeAt(0) ?? 0) % palette.length;
                                            if (typeof window !== "undefined" && !(window as any).__loggedMissingImg?.[product.id]) {
                                                (window as any).__loggedMissingImg = (window as any).__loggedMissingImg || {};
                                                (window as any).__loggedMissingImg[product.id] = true;
                                                console.warn(`[MercadoLocal] Produto SEM image_url no banco: "${product.title}" (id: ${product.id})`);
                                            }
                                            return (
                                                <div className={`w-full aspect-square flex flex-col items-center justify-center bg-gradient-to-br ${palette[idx]} text-white`}>
                                                    <span className="text-6xl font-black drop-shadow-md">{initial}</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">Sem foto</span>
                                                </div>
                                            );
                                        })()}
                                        {/* WhatsApp Share */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                trackProductEvent({
                                                    product_id: product.id,
                                                    store_id: product.merchant_store_id,
                                                    event_type: "share",
                                                    city: product.city,
                                                    source: "landing",
                                                });
                                                const priceText = product.price_label ? ` por apenas R$${product.price_label}` : "";
                                                const storeUrl = product.merchant_store_id
                                                    ? `${window.location.origin}/loja/${product.merchant_store_id}`
                                                    : `${window.location.origin}/mercado`;
                                                const text = `🔥 *${product.title}*${priceText}\n\n${product.store_name ? `🏪 ${product.store_name}` : ""}${product.city ? ` • 🚚 Entrega em ${product.city}` : ""}\n✅ Pronta Entrega!\n\n👉 Confira: ${storeUrl}`;
                                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                                            }}
                                            className="absolute top-1.5 right-1.5 bg-green-500 hover:bg-green-600 text-white rounded-full p-1.5 shadow-lg transition-all opacity-0 group-hover/card:opacity-100 z-10"
                                            title="Compartilhar no WhatsApp"
                                        >
                                            <Share2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>

                                    {/* Info */}
                                    <div className="p-3 space-y-2 flex-1 flex flex-col">
                                        <h3 className="text-[17px] text-gray-800 line-clamp-2 leading-snug font-semibold min-h-[42px]">
                                            {product.title}
                                        </h3>

                                        {price ? (
                                            <div className="flex-1">
                                                <p className="text-[26px] font-bold text-gray-900 leading-tight tracking-tight">
                                                    <span className="text-[16px] align-top">R$</span>
                                                    {price.integer}
                                                    <span className="text-[16px] align-top">,{price.decimal}</span>
                                                </p>
                                                <p className="text-[13px] text-emerald-600 font-bold mt-0.5 flex items-center gap-0.5">
                                                    <CheckCircle className="h-3 w-3" /> Pronta Entrega
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex-1">
                                                <p className="text-[14px] text-gray-400 italic">Sob consulta</p>
                                            </div>
                                        )}

                                        {/* Store & Location */}
                                        <div className="space-y-1.5 pt-2 mt-auto border-t border-gray-100">
                                            <div
                                                className="flex items-center gap-1.5 cursor-pointer hover:text-orange-500 transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (product.merchant_store_id) {
                                                        consumeMarketplaceProductClick({
                                                            productId: product.id,
                                                            storeId: product.merchant_store_id,
                                                            city: product.city,
                                                            neighborhood: product.neighborhood,
                                                            source: "store_name",
                                                        });
                                                        navigate(`/loja/${product.merchant_store_id}`);
                                                    }
                                                }}
                                            >
                                                <Store className="h-3.5 w-3.5 text-[#FF6A00] shrink-0" />
                                                <span className="text-xs font-bold text-gray-600 truncate flex-1 leading-tight">{product.store_name || "Vendedor Local"}</span>
                                            </div>
                                            
                                            {(product.city || product.neighborhood) && (
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                                    <span className="text-[10px] text-gray-500 truncate font-medium">
                                                        {[product.city, product.neighborhood].filter(Boolean).join(" • ")}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* CTA Buttons */}
                                        <div className="mt-auto space-y-1.5 pt-2">
                                            {/* Add to Cart */}
                                            {product.merchant_store_id && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        globalCart.addItem({
                                                            storeId: product.merchant_store_id!,
                                                            productId: product.id,
                                                            quantity: 1,
                                                            productTitle: product.title,
                                                            productImageUrl: product.image_url,
                                                            productPrice: parseFloat(String(product.price_label || "0").replace(",", ".").replace(/[^\d.]/g, "")) || 0,
                                                            storeName: product.store_name || "Loja",
                                                            storeLogo: product.store_logo || null,
                                                        });
                                                    }}
                                                    disabled={globalCart.addingProductId === product.id}
                                                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-white bg-[#FF6A00] hover:bg-[#e65c00] transition-all duration-200"
                                                >
                                                    {globalCart.addingProductId === product.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <ShoppingBag className="h-3.5 w-3.5" />
                                                    )}
                                                    Adicionar Cesta
                                                </button>
                                            )}

                                            {/* Botão "Minha Oferta é..." — abre modal de proposta de desconto */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    trackProductEvent({
                                                        product_id: product.id,
                                                        store_id: product.merchant_store_id,
                                                        event_type: "click",
                                                        city: product.city,
                                                        source: "minha_oferta",
                                                    });
                                                    setDiscountProduct(product);
                                                }}
                                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] transition-all duration-200 shadow-sm"
                                            >
                                                <Percent className="h-3.5 w-3.5" />
                                                Minha Oferta é...
                                            </button>

                                            {/* Botão "Saber mais" — abre modal de pergunta direto pro vendedor */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    trackProductEvent({
                                                        product_id: product.id,
                                                        store_id: product.merchant_store_id,
                                                        event_type: "click",
                                                        city: product.city,
                                                        source: "saber_mais",
                                                    });
                                                    setInquiryProduct(product);
                                                    setInquiryOpen(true);
                                                }}
                                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all duration-200 shadow-sm"
                                            >
                                                <Info className="h-3.5 w-3.5" />
                                                Saber mais
                                            </button>

                                             {/* WhatsApp Direct Button */}
                                             {product.whatsapp && (
                                                 <button
                                                     onClick={(e) => {
                                                         e.stopPropagation();
                                                         trackProductEvent({
                                                             product_id: product.id,
                                                             store_id: product.merchant_store_id,
                                                             event_type: "click",
                                                             city: product.city,
                                                             source: "whatsapp_contact",
                                                         });
                                                         const cleanNumber = product.whatsapp.replace(/\D/g, "");
                                                         const storeUrl = product.merchant_store_id 
                                                             ? `${window.location.origin}/loja/${product.merchant_store_id}`
                                                             : window.location.href;
                                                         const text = `Olá! Vi o produto *${product.title}* e gostaria de mais informações.\n\nLink: ${storeUrl}`;
                                                         window.open(`https://wa.me/55${cleanNumber}?text=${encodeURIComponent(text)}`, "_blank");
                                                     }}
                                                     className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white bg-green-500 hover:bg-green-600 transition-all duration-200 shadow-sm"
                                                 >
                                                     <MessageCircle className="h-4 w-4" />
                                                     Quer falar direto com o vendedor
                                                 </button>
                                             )}

                                             {/* Specialized Auction or Arremate Button */}
                                             {matchedAuction && (
                                                matchedAuction.listing_type === "arremate" ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAuction(matchedAuction);
                                                            setAuctionModalOpen(true);
                                                        }}
                                                        className="w-full py-1.5 rounded-lg text-[12px] font-bold text-violet-600 border border-violet-100 bg-violet-50 hover:bg-violet-100 transition-all text-center"
                                                    >
                                                        ⚡ Arremate
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAuction(matchedAuction);
                                                            setAuctionModalOpen(true);
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-sm"
                                                    >
                                                        <Gavel className="h-3.5 w-3.5" />
                                                        Ver Leilão
                                                        <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded ml-1">
                                                            <AuctionCountdown endsAt={matchedAuction.ends_at} />
                                                        </span>
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                )}
            </div>
            </div>
          </>
        )}

            {/* ── Modals ── */}
            <LeadCaptureModal
                product={selectedProduct}
                open={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
            />

            <DiscountRequestModal
                product={discountProduct}
                open={!!discountProduct}
                onClose={() => setDiscountProduct(null)}
            />

            {/* Rodapé simples — só desktop (no celular o menu inferior já cobre) */}
            <footer className="hidden md:block mt-10">
                <div className="bg-blue-600 text-white py-7 px-6 text-center">
                    <p className="text-base font-black">Viagg-TX8 · Mercado Local</p>
                    <p className="text-sm text-blue-100 mt-1">Compre do comércio local — com segurança e entrega rápida.</p>
                    <p className="text-xs text-blue-200 mt-2">© {new Date().getFullYear()} Viagg-TX8 · Todos os direitos reservados · Desenvolvido pela Viagg-TX8</p>
                </div>
            </footer>

            <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />

            {/* Modal "Saber mais" — visitante manda pergunta direto pro vendedor */}
            <ProductInquiryModal
                open={inquiryOpen}
                onClose={() => { setInquiryOpen(false); setInquiryProduct(null); }}
                product={inquiryProduct}
            />
        </MarketLayout>
    );
}
