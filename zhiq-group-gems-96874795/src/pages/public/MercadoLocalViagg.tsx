import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    Briefcase,
    Plane,
} from "lucide-react";
import { ProductInquiryModal } from "@/components/public/ProductInquiryModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, parseBRLCurrency, formatCurrencyBRL } from "@/lib/utils";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";
import { consumeMarketplaceProductClick } from "@/lib/credits/consumeMarketplaceProductClick";
import LeadCaptureModal from "@/components/public/LeadCaptureModal";
import DiscountRequestModal from "@/components/public/DiscountRequestModal";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";
import { useMarketplaceTracking } from "@/hooks/analytics/useMarketplaceTracking";
import { MarketPropertyCard } from "@/components/real-estate/MarketPropertyCard";
import { MarketVehicleCard } from "@/components/advertiser/MarketVehicleCard";
import { MarketServiceCard } from "@/components/services/MarketServiceCard";
import { MarketFreightCard } from "@/components/freight/MarketFreightCard";
import { MarketTravelCard } from "@/components/travel/MarketTravelCard";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { useIsAdvertiser } from "@/hooks/useIsAdvertiser";
import { AdvertiserHub } from "@/components/advertiser/AdvertiserHub";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { MercadoAuctionsSection } from "@/components/public/MercadoAuctionsSection";

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

// Palavras-chave → emoji. Casa por "contém", cobrindo nomes longos de categoria
// (ex.: "Celulares e Smartphones", "Acessórios de Computador"). Ordem importa:
// chaves mais específicas vêm antes das genéricas.
const CATEGORY_KEYWORDS: Array<[string, string]> = [
    ["hortifruti", "🥬"], ["horti", "🥬"], ["verdura", "🥬"], ["legume", "🥕"], ["fruta", "🍎"],
    ["videoaula", "🎬"], ["curso", "🎓"], ["aula", "🎓"], ["ebook", "📘"], ["educac", "🎓"], ["treinamento", "🎓"],
    ["tipografi", "🔤"], ["fonte", "🔤"],
    ["abajur", "💡"], ["luminaria", "💡"], ["lampada", "💡"], ["ilumin", "💡"],
    ["construc", "🧱"], ["ferramenta", "🔧"], ["eletrica", "🔌"], ["hidraulic", "🚿"],
    ["smartphone", "📱"], ["celular", "📱"], ["telefone", "📞"],
    ["acessorios de computador", "🖱️"], ["acessorio de computador", "🖱️"], ["mouse", "🖱️"], ["teclado", "⌨️"], ["monitor", "🖥️"],
    ["software", "💿"], ["licenca", "🔑"], ["aplicativo", "📲"], ["app", "📲"],
    ["informatica", "🖥️"], ["notebook", "💻"], ["computador", "💻"], ["hardware", "🖥️"],
    ["arte", "🎨"], ["design", "🎨"], ["grafic", "🎨"], ["artesanato", "🧶"],
    ["alimento", "🥗"], ["comida", "🍽️"], ["lanche", "🍔"], ["bebida", "🧃"], ["doce", "🍰"], ["cafe", "☕"], ["padaria", "🥐"],
    ["fone", "🎧"], ["camera", "📷"], ["televis", "📺"], ["console", "🕹️"], ["game", "🎮"], ["eletronic", "🔌"],
    ["moda", "👗"], ["roupa", "👕"], ["calcado", "👟"], ["sapato", "👟"], ["bolsa", "👜"], ["joia", "💍"], ["relogio", "⌚"], ["oculos", "🕶️"],
    ["beleza", "💄"], ["cosmetic", "💄"], ["perfume", "🧴"], ["saude", "💊"], ["farmac", "💊"],
    ["esporte", "⚽"], ["fitness", "🏋️"], ["bicicleta", "🚲"],
    ["decorac", "🛋️"], ["movel", "🛋️"], ["movei", "🛋️"], ["cozinha", "🍳"], ["casa", "🏠"],
    ["automov", "🚗"], ["veiculo", "🚗"], ["carro", "🚗"], ["moto", "🏍️"], ["pneu", "🛞"], ["pecas", "⚙️"],
    ["pet", "🐾"], ["animal", "🐾"], ["flor", "🌻"], ["planta", "🪴"], ["jardim", "🌱"],
    ["brinquedo", "🧸"], ["bebe", "🍼"], ["infantil", "🧸"],
    ["livro", "📚"], ["papelaria", "✏️"], ["escritorio", "🗂️"],
    ["musica", "🎵"], ["instrumento", "🎸"],
    ["imovel", "🏠"], ["imovei", "🏠"], ["terreno", "🌳"], ["aluguel", "🔑"],
    ["servico", "🛠️"],
];

function getCategoryIcon(nome: string, icone: string | null): string {
    // Respeita um ícone real vindo do banco, mas ignora o selo genérico 🏷️.
    if (icone && icone.trim() && icone.trim() !== "🏷️") return icone.trim();
    const key = normalizeCategoryKey(nome);
    // 1) match exato no mapa de emojis
    const exact = CATEGORY_ICONS[key] ?? CATEGORY_ICONS[nome.toLowerCase().trim()];
    if (exact) return exact;
    // 2) match por palavra-chave (nomes longos)
    for (const [kw, emoji] of CATEGORY_KEYWORDS) {
        if (key.includes(kw)) return emoji;
    }
    // 3) fallback genérico
    return icone?.trim() || "🏷️";
}

// Converte um emoji na URL da imagem SVG colorida (Twemoji) — ícones "reais",
// nítidos e consistentes em qualquer aparelho. Remove o seletor de variação (FE0F).
function twemojiUrl(emoji: string): string {
    const cps: string[] = [];
    for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp === undefined || cp === 0xfe0f || cp === 0x200d) continue;
        cps.push(cp.toString(16));
    }
    return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cps.join("-")}.svg`;
}

// Ícone de categoria como imagem (Twemoji). Se a imagem falhar, cai pro emoji.
function CategoryIcon({ nome, icone }: { nome: string; icone: string | null }) {
    const emoji = getCategoryIcon(nome, icone);
    const [failed, setFailed] = useState(false);
    if (failed) return <span className="text-3xl leading-none">{emoji}</span>;
    return (
        <img
            src={twemojiUrl(emoji)}
            alt=""
            loading="lazy"
            className="w-8 h-8 object-contain select-none pointer-events-none"
            onError={() => setFailed(true)}
        />
    );
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

// Categorias de outros módulos/seções da plataforma que não devem se misturar na vitrine do Mercado
const OTHER_MODULE_KEYS = new Set([
    "imoveis", "imovel", "real estate", "propriedades", "casa", "apartamento",
    "veiculos", "veiculo", "automoveis", "automovel", "carros", "carro", "motos", "moto",
    "servicos", "servico", "services",
    "fretes", "frete", "mudancas", "mudanca", "fretes & mudancas", "transportes", "transporte",
    "viagens", "viagem", "turismo", "viagens & turismo", "tours", "pacotes",
    "corridas", "motoboy"
]);

function isOtherModuleCategory(category: string | null | undefined): boolean {
    if (!category) return false;
    const key = normalizeCategoryKey(category);
    return OTHER_MODULE_KEYS.has(key);
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
    const num = parseBRLCurrency(price);
    if (num <= 0) return null;
    const formatted = formatCurrencyBRL(num).replace("R$", "").trim();
    const lastCommaIndex = formatted.lastIndexOf(",");
    if (lastCommaIndex !== -1) {
        const integer = formatted.substring(0, lastCommaIndex);
        const decimal = formatted.substring(lastCommaIndex + 1);
        return { integer, decimal };
    }
    return { integer: formatted, decimal: "00" };
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
    /* SEGMENTAÇÃO (2026-07-12): /mercado exibe SOMENTE produtos por padrão.
       Imóveis/Veículos/Serviços/Fretes/Viagens têm páginas próprias.
       ?view=completo restaura a vitrine agregada antiga se necessário. */
    const productsOnly = viewParam !== "completo";
    // Pesquisa persistente: buscas feitas em outras páginas chegam via ?q=
    const [search, setSearch] = useState(searchParams.get("q") ?? "");
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

    const [carouselMode, setCarouselMode] = useState(false);


    // Botão Motoboy do topo: sempre manda pra tela de cadastro/login do motoboy.
    const handleMotoboyClick = () => {
        localStorage.setItem("viagg_auth_entry", "motoboy");
        navigate("/auth?entry=motoboy&signup=1");
    };

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
                    .select("id, nome_loja, logo_url, cidade, estado, bairro, rua, cep, telefone, whatsapp, name")
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
                    neighborhood: store.neighborhood || store.bairro || profile.bairro || null,
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
                // Se tiver thumb processada (bucket real-estate-public), usa ela. Senão, cai pro
                // path original — que fica no bucket real-estate-original, não no -public!
                const hasThumb = !!media?.thumb_masked_storage_path;
                const storagePath = media?.thumb_masked_storage_path || media?.original_storage_path;
                if (storagePath) {
                    thumbnailUrl = getListingImageUrl(storagePath, hasThumb ? 'public' : 'original');
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

    // ── Fetch service listings ──
    const { data: rawServiceListings = [] } = useQuery<any[]>({
        queryKey: ['public-services'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('public_service_listings' as any)
                .select('*')
                .order('published_at', { ascending: false });

            if (error) throw error;

            const rows = (data as any[]) || [];
            if (rows.length === 0) return [];

            const ids = rows.map((s: any) => s.id);
            const { data: mediaRows } = await supabase
                .from('service_media' as any)
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
                            p.startsWith('http') ? p : supabase.storage.from('real-estate-original').getPublicUrl(p).data.publicUrl
                        );
                    }
                }
            }
            return rows.map((s: any) => ({ ...s, thumbnail_url: mediaMap.get(s.id) || null }));
        },
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

    const serviceListings = useMemo(() => {
        return rawServiceListings.filter((s) => {
            if (cityFilter !== "all" && s.city?.trim().toLowerCase() !== cityFilter) return false;
            if (neighborhoodFilter !== "all") {
                const nb = String(s.neighborhood || "").trim().toLowerCase();
                if (nb !== neighborhoodFilter.toLowerCase()) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !s.title?.toLowerCase().includes(q) &&
                    !s.city?.toLowerCase().includes(q) &&
                    !s.neighborhood?.toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [rawServiceListings, search, cityFilter, neighborhoodFilter]);

    // ── Fetch freight listings ──
    const { data: rawFreightListings = [] } = useQuery<any[]>({
        queryKey: ['public-freight'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('public_freight_listings' as any)
                .select('*')
                .order('is_featured', { ascending: false })
                .order('published_at', { ascending: false });

            if (error) throw error;

            const rows = (data as any[]) || [];
            if (rows.length === 0) return [];

            const ids = rows.map((s: any) => s.id);
            const { data: mediaRows } = await supabase
                .from('freight_media' as any)
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
                            p.startsWith('http') ? p : supabase.storage.from('real-estate-original').getPublicUrl(p).data.publicUrl
                        );
                    }
                }
            }
            return rows.map((s: any) => ({ ...s, thumbnail_url: mediaMap.get(s.id) || null }));
        },
        refetchInterval: 10000,
        refetchOnWindowFocus: true,
    });

    const freightListings = useMemo(() => {
        return rawFreightListings.filter((s) => {
            if (cityFilter !== "all" && s.city?.trim().toLowerCase() !== cityFilter) return false;
            if (neighborhoodFilter !== "all") {
                const nb = String(s.neighborhood || "").trim().toLowerCase();
                if (nb !== neighborhoodFilter.toLowerCase()) return false;
            }
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !s.title?.toLowerCase().includes(q) &&
                    !s.city?.toLowerCase().includes(q) &&
                    !s.neighborhood?.toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [rawFreightListings, search, cityFilter, neighborhoodFilter]);

    // ── Fetch travel listings ──
    const { data: rawTravelListings = [] } = useQuery<any[]>({
        queryKey: ['public-travel'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('travel_listings' as any)
                .select('id, title, category, destination, city, state, price_per_person, total_price, entry_price, is_featured, departure_date, duration_days, available_spots, visibility_status, published_at, created_at')
                .eq('visibility_status', 'published')
                .order('is_featured', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('[travel] erro ao buscar travel_listings:', error.message);
                return [];
            }

            const rows = (data as any[]) || [];
            if (rows.length === 0) return [];

            const ids = rows.map((s: any) => s.id);
            const { data: mediaRows } = await supabase
                .from('travel_media' as any)
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
                            p.startsWith('http') ? p : supabase.storage.from('real-estate-original').getPublicUrl(p).data.publicUrl
                        );
                    }
                }
            }
            return rows.map((s: any) => ({ ...s, thumbnail_url: mediaMap.get(s.id) || null }));
        },
        staleTime: 0,
        refetchInterval: 8000,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
    });

    const travelListings = useMemo(() => {
        return rawTravelListings.filter((s) => {
            if (search.trim()) {
                const q = search.toLowerCase();
                if (
                    !s.title?.toLowerCase().includes(q) &&
                    !s.destination?.toLowerCase().includes(q)
                ) return false;
            }
            return true;
        });
    }, [rawTravelListings, search]);

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
            if (productsOnly && isOtherModuleCategory(p.category)) return;
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

        // Chips de outros módulos SÓ na visão agregada (?view=completo) —
        // segmentação: o Mercado padrão não mistura categorias de outros módulos
        if (!productsOnly && rawPropertyListings.length > 0) {
            extras.push({
                id: 'cat-imoveis',
                nome: 'Imóveis',
                icone: '🏠',
                created_at: '',
                count: rawPropertyListings.length,
            });
        }

        if (!productsOnly && rawVehicleListings.length > 0) {
            extras.push({
                id: 'cat-automoveis',
                nome: 'Automóveis',
                icone: '🚗',
                created_at: '',
                count: rawVehicleListings.length,
            });
        }

        return [...matched, ...extras].sort((a, b) => b.count - a.count);
    }, [categories, products, rawPropertyListings, rawVehicleListings, rawServiceListings, productsOnly]);

    const filtered = useMemo(() => {
        return products.filter(p => {
            if (productsOnly && isOtherModuleCategory(p.category)) return false;
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

    const handleMercadoNavClick = () => {
        if (searchParams.toString() !== "") {
            navigate("/mercado");
        }
        setCategoryFilter("all");
        setCityFilter("all");
        setNeighborhoodFilter("all");
        setConditionFilter("all");
        setListingTypeFilter("all");
        setSearch("");
        setCarouselMode(false);
        scrollToProducts();
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
            headerChildren={!isAdvertiser ? (
                <MarketNavButtons
                    onMotoboyClick={handleMotoboyClick}
                    onMercadoClick={handleMercadoNavClick}
                />
            ) : null}
            hideTopMotoboy={false}
            mainClassName="flex flex-col bg-[#F5E62B]"
            hideFooter={isAdvertiser}
            blueFooter={!isAdvertiser}
            blueFooterLabel="🛒 Mercado Local"
            myAccountPath="/minha-conta"
        >
            {isAdvertiser ? (
                <div className="bg-[#F5E62B] min-h-[70vh]">
                    <AdvertiserHub />
                </div>
            ) : (
                <>
<InstitutionalSafetyBanner />

            {/* ═══ LEILÕES — vitrine (ativos; ao buscar "leilão" mostra TODOS) ═══ */}
            <MercadoAuctionsSection search={search} />

            {/* CTA para anunciantes */}
            <div className="w-full px-4 lg:px-6 pb-4 pt-6 lg:pt-8">
                <div className="max-w-[1920px] mx-auto">
                    <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                        <div className="text-white space-y-1">
                            <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para lojistas e comerciantes</p>
                            <h3 className="text-xl font-black leading-tight">🛍️ Anuncie seu produto aqui!</h3>
                            <p className="text-sm text-sky-100">Alcance compradores na sua região. Cadastro rápido e gratuito.</p>
                        </div>
                        <button
                            onClick={() => navigate("/auth?entry=advertiser")}
                            className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
                        >
                            Anunciar meu produto →
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ REAL ESTATE SECTION ═══ */}
            {!productsOnly && (categoryFilter === "all" || categoryFilter === "Imóveis") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-[#F5E62B]">
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

                        {/* CTA Imóveis */}
                        <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                            <div className="text-white space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para corretores e proprietários</p>
                                <h3 className="text-xl font-black leading-tight">🏢 Anuncie seu imóvel aqui!</h3>
                                <p className="text-sm text-sky-100">Encontre compradores e inquilinos na sua região. Cadastro rápido e gratuito.</p>
                            </div>
                            <button
                                onClick={() => navigate("/auth?entry=advertiser")}
                                className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
                            >
                                Anunciar meu imóvel →
                            </button>
                        </div>

                        <HorizontalCarousel>
                            {propertyListings.length > 0 ? (
                                propertyListings.map((prop) => (
                                    <MarketPropertyCard key={prop.id} property={prop} />
                                ))
                            ) : (
                                <div
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="border-2 border-dashed border-zinc-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-orange-200 hover:bg-orange-50/20 transition-all cursor-pointer group h-64"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-[#FF6A00] transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie seu imóvel aqui.</p>
                                    </div>
                                </div>
                            )}
                        </HorizontalCarousel>
                    </div>
                </div>
            )}

            {/* ═══ SERVICES SECTION ═══ */}
            {!productsOnly && (categoryFilter === "all" || categoryFilter === "Serviços") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-[#F5E62B]">
                    <div className="max-w-[1920px] mx-auto space-y-10">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-violet-600/10 rounded-lg">
                                        <Briefcase className="w-5 h-5 text-violet-600" />
                                    </div>
                                    <span className="text-xs font-black text-violet-600 uppercase tracking-widest">Oportunidades Locais</span>
                                </div>
                                <h2 className="text-4xl font-black text-zinc-900 tracking-tighter">SERVIÇOS EM DESTAQUE</h2>
                                <p className="text-zinc-500 font-medium max-w-xl">
                                    Divulgue sua empresa e receba contatos de clientes interessados.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="rounded-2xl font-bold border-zinc-200 hover:bg-zinc-50 gap-2 h-12"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('viagg-close-cart'));
                                    if (serviceListings.length > 0) window.open('/servicos', '_blank');
                                    else window.open('/auth?entry=advertiser', '_blank');
                                }}
                            >
                                {serviceListings.length > 0 ? 'Ver todos os serviços' : 'Anuncie agora'}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* CTA Serviços */}
                        <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                            <div className="text-white space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para prestadores de serviço</p>
                                <h3 className="text-xl font-black leading-tight">🔧 Anuncie seu serviço aqui!</h3>
                                <p className="text-sm text-sky-100">Alcance clientes na sua região. Cadastro rápido e gratuito.</p>
                            </div>
                            <button
                                onClick={() => navigate("/auth?entry=advertiser")}
                                className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
                            >
                                Anunciar meu serviço →
                            </button>
                        </div>

                        <HorizontalCarousel>
                            {serviceListings.length > 0 ? (
                                serviceListings.map((serv) => (
                                    <MarketServiceCard key={serv.id} service={serv} />
                                ))
                            ) : (
                                <div
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="border-2 border-dashed border-zinc-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-violet-200 hover:bg-violet-50/40 transition-all cursor-pointer group h-64"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-violet-600 transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie seu serviço aqui.</p>
                                    </div>
                                </div>
                            )}
                        </HorizontalCarousel>
                    </div>
                </div>
            )}

            {/* ═══ FREIGHT SECTION ═══ */}
            {!productsOnly && (categoryFilter === "all" || categoryFilter === "Fretes") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-[#F5E62B]">
                    <div className="max-w-[1920px] mx-auto space-y-10">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-600/10 rounded-lg">
                                        <Truck className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Mudanças e Cargas Grandes</span>
                                </div>
                                <h2 className="text-4xl font-black text-zinc-900 tracking-tighter">FRETES & TRANSPORTES</h2>
                                <p className="text-zinc-500 font-medium max-w-xl">
                                    Mudanças, móveis, eletrodomésticos e cargas volumosas — peça orçamento direto.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="rounded-2xl font-bold border-zinc-200 hover:bg-zinc-50 gap-2 h-12"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('viagg-close-cart'));
                                    if (freightListings.length > 0) window.open('/fretes', '_blank');
                                    else window.open('/auth?entry=advertiser', '_blank');
                                }}
                            >
                                {freightListings.length > 0 ? 'Ver todos os fretes' : 'Anuncie agora'}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* CTA Fretes */}
                        <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                            <div className="text-white space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para transportadoras e motoristas</p>
                                <h3 className="text-xl font-black leading-tight">🚚 Anuncie seu frete aqui!</h3>
                                <p className="text-sm text-sky-100">Encontre clientes precisando de transporte na sua região. Cadastro rápido e gratuito.</p>
                            </div>
                            <button
                                onClick={() => navigate("/auth?entry=advertiser")}
                                className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
                            >
                                Anunciar meu frete →
                            </button>
                        </div>

                        <HorizontalCarousel>
                            {freightListings.length > 0 ? (
                                freightListings.map((fr) => (
                                    <MarketFreightCard key={fr.id} freight={fr} />
                                ))
                            ) : (
                                <div
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="border-2 border-dashed border-zinc-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-blue-200 hover:bg-blue-50/40 transition-all cursor-pointer group h-64"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-blue-600 transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie sua transportadora aqui.</p>
                                    </div>
                                </div>
                            )}
                        </HorizontalCarousel>
                    </div>
                </div>
            )}

            {/* ═══ TRAVEL SECTION ═══ */}
            {!productsOnly && (categoryFilter === "all" || categoryFilter === "Viagens") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-[#F5E62B]">
                    <div className="max-w-[1920px] mx-auto space-y-10">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-sky-600/10 rounded-lg">
                                        <Plane className="w-5 h-5 text-sky-600" />
                                    </div>
                                    <span className="text-xs font-black text-sky-600 uppercase tracking-widest">Pacotes & Destinos</span>
                                </div>
                                <h2 className="text-4xl font-black text-zinc-900 tracking-tighter">VIAGENS & TURISMO</h2>
                                <p className="text-zinc-500 font-medium max-w-xl">
                                    Pacotes completos, roteiros nacionais e internacionais — peça orçamento direto com a agência.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="rounded-2xl font-bold border-zinc-200 hover:bg-zinc-50 gap-2 h-12"
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('viagg-close-cart'));
                                    if (travelListings.length > 0) window.open('/viagens', '_blank');
                                    else window.open('/auth?entry=advertiser', '_blank');
                                }}
                            >
                                {travelListings.length > 0 ? 'Ver todas as viagens' : 'Anuncie agora'}
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* CTA Viagens */}
                        <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                            <div className="text-white space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para agências e guias</p>
                                <h3 className="text-xl font-black leading-tight">✈️ Anuncie sua viagem aqui!</h3>
                                <p className="text-sm text-sky-100">Venda pacotes e excursões para clientes. Cadastro rápido e gratuito.</p>
                            </div>
                            <button
                                onClick={() => navigate("/auth?entry=advertiser")}
                                className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
                            >
                                Anunciar minha viagem →
                            </button>
                        </div>

                        <HorizontalCarousel cardWidth="w-[calc(100vw-2rem)] sm:w-80">
                            {travelListings.length > 0 ? (
                                travelListings.map((tr) => (
                                    <MarketTravelCard key={tr.id} travel={tr} />
                                ))
                            ) : (
                                <div
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="border-2 border-dashed border-sky-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-sky-200 hover:bg-sky-50/40 transition-all cursor-pointer group h-64"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-sky-600 transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie seus pacotes de viagem aqui.</p>
                                    </div>
                                </div>
                            )}
                        </HorizontalCarousel>
                    </div>
                </div>
            )}

            {/* ═══ AUTOMOTIVE SECTION ═══ */}
            {!productsOnly && (categoryFilter === "all" || categoryFilter === "Automóveis") && (
                <div className="w-full px-4 lg:px-6 py-12 bg-[#F5E62B]">
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

                        {/* CTA Automóveis */}
                        <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                            <div className="text-white space-y-1">
                                <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para concessionárias e vendedores</p>
                                <h3 className="text-xl font-black leading-tight">🚗 Anuncie seu veículo aqui!</h3>
                                <p className="text-sm text-sky-100">Venda carros, motos e caminhões rapidamente. Cadastro rápido e gratuito.</p>
                            </div>
                            <button
                                onClick={() => navigate("/auth?entry=advertiser")}
                                className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
                            >
                                Anunciar meu veículo →
                            </button>
                        </div>

                        <HorizontalCarousel>
                            {vehicleListings.length > 0 ? (
                                vehicleListings.map((veh) => (
                                    <MarketVehicleCard key={veh.id} vehicle={veh} />
                                ))
                            ) : (
                                <div
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    className="border-2 border-dashed border-blue-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 hover:border-blue-200 hover:bg-blue-50/20 transition-all cursor-pointer group h-64"
                                >
                                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-blue-500 transition-all">
                                        <Plus className="w-8 h-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-zinc-900 uppercase text-sm">Seja o primeiro</h4>
                                        <p className="text-zinc-400 text-xs font-medium">Anuncie seu veículo aqui.</p>
                                    </div>
                                </div>
                            )}
                        </HorizontalCarousel>
                    </div>
                </div>
            )}

            {/* ═══ REAL ESTATE MODULE PROMO ═══ */}
            <div className="max-w-[1920px] mx-auto px-4 lg:px-6 mt-4">
                <div 
                    className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#00a300] to-[#008c00] p-6 md:p-10 border border-white/10 shadow-xl group cursor-pointer"
                    onClick={() => {
                        supabase.from('analytics_events' as any).insert({ 
                            event_name: 'market_sell_cta_clicked', 
                            user_id: user?.id || null, 
                            metadata: { position: 'hero_banner' } 
                        } as any);
                        if (user) {
                          localStorage.setItem("viagg_auth_entry", "advertiser");
                          // Tela de vendas: escolher Lojista ou Imóveis.
                          navigate("/select-profile");
                        } else {
                          navigate("/auth");
                        }
                    }}
                >
                    {/* Background glow */}
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-[#F5E62B]/25 rounded-full blur-[80px] animate-pulse" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex-1 space-y-3 text-center md:text-left">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-[10px] font-black uppercase tracking-widest">
                                <Sparkles className="w-3 h-3" />
                                Seja um Parceiro Viagg
                            </div>
                            <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter leading-tight">
                                ANUNCIE SEUS PRODUTOS E ALCANCE <br />
                                <span className="text-[#F5E62B]">COMPRADORES DA SUA REGIÃO</span>
                            </h2>
                        </div>
                        <div className="shrink-0">
                           <div className="bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xl px-10 py-5 rounded-2xl shadow-2xl transition-all flex items-center justify-center text-center gap-3 group-hover:scale-105">
                                <img src="/assets/brand/viagg-tx8-logo-premium.png" alt="Viagg-TX8" className="w-8 h-8 shrink-0 rounded-md group-hover:scale-110 transition-transform" />
                                <span className="leading-tight">QUERO<br />VENDER</span>
                           </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Categoria Bar Movida para baixo */}

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
                        <HorizontalCarousel gap="gap-4">
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
                                        className="rounded-[24px] overflow-hidden bg-white border border-orange-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.12)] transition-all duration-300 cursor-pointer group flex flex-col h-full"
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
                        </HorizontalCarousel>
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

                {/* ═══ CATEGORY BAR (Sticky) ═══ */}
                {activeCategories.length > 0 && (
                    <div className="sticky top-[112px] sm:top-[120px] lg:top-[140px] z-40 bg-[#F5E62B] py-2 mb-6 -mx-4 px-4 lg:mx-0 lg:px-0 shadow-sm border-b border-yellow-500/20 transition-all duration-300">
                        <div className="w-full relative max-w-[1920px] mx-auto">
                            <button
                                type="button"
                                aria-label="Categorias anteriores"
                                onClick={() => scrollCategoryBar("left")}
                                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-all">
                                <ChevronLeft className="h-5 w-5 text-[#FF6A00]" />
                            </button>
                            <button
                                type="button"
                                aria-label="Próximas categorias"
                                onClick={() => scrollCategoryBar("right")}
                                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-all">
                                <ChevronRight className="h-5 w-5 text-[#FF6A00]" />
                            </button>

                            <div ref={categoryBarRef}
                                className="flex items-center gap-2 md:gap-3 py-2 overflow-x-auto scrollbar-hide scroll-smooth px-10 lg:px-12">
                                <button
                                    onClick={() => { setCategoryFilter("all"); scrollToProducts(); }}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl min-w-[72px] md:min-w-[140px] md:flex-1 md:py-3 transition-all duration-200 shrink-0",
                                        categoryFilter === "all"
                                            ? "bg-[#FF6A00] text-white shadow-md shadow-orange-200 scale-105"
                                            : "bg-white text-gray-500 shadow-sm hover:bg-orange-50 hover:text-[#FF6A00]"
                                    )}>
                                    <span className="text-3xl"><LayoutGrid className="h-8 w-8" /></span>
                                    <span className="text-[10px] md:text-xs font-bold whitespace-nowrap">Todos</span>
                                </button>

                                {activeCategories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => { setCategoryFilter(cat.nome); scrollToProducts(); }}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl min-w-[72px] md:min-w-[140px] md:flex-1 md:py-3 transition-all duration-200 shrink-0 relative",
                                            categoryFilter === cat.nome
                                                ? "bg-[#FF6A00] text-white shadow-md shadow-orange-200 scale-105"
                                                : "bg-white text-gray-500 shadow-sm hover:bg-orange-50 hover:text-[#FF6A00]"
                                        )}>
                                        <CategoryIcon nome={cat.nome} icone={cat.icone} />
                                        <span className="text-[10px] md:text-xs font-bold whitespace-nowrap truncate w-full text-center">{cat.nome}</span>
                                        <span className={cn(
                                            "absolute -top-1 -right-1 text-[8px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 shadow-sm",
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

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="text-center space-y-3">
                            <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mx-auto" />
                            <p className="text-sm text-gray-400">Carregando produtos...</p>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    // Sem produtos de loja: se já tem imóveis/veículos/serviços em
                    // destaque na página, não mostra esse aviso vazio (fica redundante).
                    (!search && (rawPropertyListings.length > 0 || rawVehicleListings.length > 0 || rawServiceListings.length > 0 || rawFreightListings.length > 0)) ? null : (
                    <div className="text-center py-20 bg-white rounded-xl shadow-sm">
                        <ShoppingBag className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-gray-600">Nenhum produto encontrado</h2>
                        <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
                            {search ? `Nenhum resultado para "${search}"` : "Os comerciantes ainda não publicaram produtos."}
                        </p>
                    </div>
                    )
                ) : (
                  <div>
                    <h2 className="text-xl font-bold text-gray-800 mb-4">
                      Produtos {conditionFilter === "all" ? "Todos" : conditionFilter === "novo" ? "Novos" : "Usados"}
                    </h2>
                    <div ref={gridRef} className={carouselMode
                        ? "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-hide"
                        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5"
                    }>
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
                                    className={`rounded-[24px] overflow-hidden cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.05)] lg:hover:shadow-[0_16px_40px_rgba(0,0,0,0.12)] lg:hover:-translate-y-0.5 transition-all duration-300 bg-white border border-zinc-100/80 group/card flex flex-col${carouselMode ? " snap-start shrink-0 w-[75vw] sm:w-[45vw] lg:w-[30vw] h-auto" : " h-full"}`}
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
                                        /* Clique no produto → página do produto (ou tracking slug).
                                           O clique na loja no rodapé do card vai para a loja do ofertante. */
                                        if (product.tracking_slug) {
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
                                                    className="absolute inset-0 w-full h-full object-cover lg:group-hover/card:scale-105 transition-transform duration-300 z-10"
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

                                        {/* ─── IDENTIDADE VIAGG-TX8 (marca discreta sobre a imagem do produto) ─── */}
                                        {/* Watermark central VX (anti-print + marca; 7% opacidade; não interfere) */}
                                        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[6]">
                                            <span className="font-black tracking-tighter text-white/[0.08] mix-blend-overlay text-5xl sm:text-6xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">VX</span>
                                        </div>
                                        {/* Selo Oficial (canto inf-esquerdo, discreto) */}
                                        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md px-2 py-0.5 pointer-events-none shadow-sm">
                                            <img src="/images/viagg-tx8-logo.png" alt="" aria-hidden="true" width={20} height={12} loading="lazy" decoding="async" className="h-3 w-auto object-contain opacity-95" />
                                            <span className="text-[8px] font-bold uppercase tracking-wider text-white/90">Oficial Viagg-TX8</span>
                                        </div>

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
                                            className="absolute top-1.5 right-1.5 bg-green-500 hover:bg-green-600 text-white rounded-full p-1.5 shadow-lg transition-all lg:opacity-0 lg:group-hover/card:opacity-100 z-10"
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
                                                <MapPin className="h-3.5 w-3.5 text-[#FF6A00] shrink-0" />
                                                <span className="text-xs font-bold text-gray-600 truncate flex-1 leading-tight">{[product.neighborhood, product.city].filter(Boolean).join(", ") || product.store_name || "Vendedor Local"}</span>
                                            </div>
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
                                                            productPrice: parseBRLCurrency(product.price_label || "0"),
                                                            storeName: product.store_name || "Loja",
                                                            storeLogo: product.store_logo || null,
                                                        });
                                                    }}
                                                    disabled={globalCart.addingProductId === product.id}
                                                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-white bg-[#FF6A00] hover:bg-[#e65c00] transition-all duration-200"
                                                >
                                                    {globalCart.addingProductId === product.id && (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
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
                                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-zinc-900 bg-[#68c7f2] hover:opacity-90 transition-all duration-200 shadow-sm"
                                            >
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
                                                Saber mais
                                            </button>


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
