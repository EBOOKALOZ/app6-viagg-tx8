import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FooterNeutral } from "@/components/FooterNeutral";
import {
    Loader2, MapPin, ShoppingBag, ShoppingCart, ExternalLink,
    Instagram, Facebook, Globe, Video, Phone, MessageCircle,
    ArrowLeft, Search, Share2, Tag, Store, Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";
import LeadCaptureModal from "@/components/public/LeadCaptureModal";
import DiscountRequestModal from "@/components/public/DiscountRequestModal";
import { Percent } from "lucide-react";
import { trackM1Event } from "@/skills/growth/trackM1Event";
import { useStoreCart } from "@/hooks/useStoreCart";
import { StoreCartDrawer } from "@/components/public/StoreCartDrawer";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { useMarketplaceTracking } from "@/hooks/analytics/useMarketplaceTracking";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}

interface CardStyle {
    label: string;
    bgColor: string;
    textColor: string;
    cardBg: string;
}

function parseCardStyle(cta: string | null): CardStyle {
    try {
        if (cta && cta.startsWith("{")) return JSON.parse(cta);
    } catch { /* ignore */ }
    return { label: "Adicionar na Cesta", bgColor: "#FF6A00", textColor: "#1A1A2E", cardBg: "#FFFFFF" };
}

interface Product {
    id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    video_url: string | null;
    external_link: string | null;
    price_label: string | null;
    cta_label: string | null;
    merchant_store_id: string | null;
    category: string | null;
    condition: string | null;
}

interface StoreData {
    store_name: string | null;
    city: string | null;
    region: string | null;
    bairro: string | null;
    address: string | null;
    cep: string | null;
    phone: string | null;
    whatsapp: string | null;
    logo_url: string | null;
    categoria: string | null;
    store_id: string | null;
    merchant_user_id: string | null;
}

// â”€â”€â”€ Cart Helpers (unified marketplace cart) â”€â”€â”€â”€â”€
function CartBadge({ cart, onOpen }: { cart: ReturnType<typeof useStoreCart>; onOpen: () => void }) {
    return (
        <button
            onClick={onOpen}
            className="relative flex items-center justify-center rounded-xl p-2 transition-all bg-white/15 hover:bg-white/25"
        >
            <ShoppingCart className="h-6 w-6 text-white" />
            {cart.totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-white text-[#FF6A00] text-[11px] font-black min-w-[20px] h-[20px] rounded-full flex items-center justify-center shadow-lg ring-2 ring-[#FF6A00] animate-in zoom-in duration-200">
                    {cart.totalItems}
                </span>
            )}
        </button>
    );
}

function AddToCartButton({ cart, productId, bgColor, onGlobalAdd }: {
    cart: ReturnType<typeof useStoreCart>; productId: string; bgColor: string;
    onGlobalAdd?: () => void;
}) {
    const isAdding = cart.addingProductId === productId || cart.isAdding;
    return (
        <button
            onClick={async () => {
                await cart.addItem(productId);
                onGlobalAdd?.();
            }}
            disabled={isAdding}
            className="w-full text-base font-bold py-3.5 rounded-2xl transition-all hover:opacity-90 active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 disabled:opacity-70"
            style={{ backgroundColor: bgColor, color: "#fff" }}
        >
            {isAdding ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <>
                    <ShoppingCart className="h-5 w-5" />
                    Adicionar na Cesta
                </>
            )}
        </button>
    );
}

export default function ProductLandingPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [showContactModal, setShowContactModal] = useState(false);
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [showLeadModal, setShowLeadModal] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);
    const [cartOpen, setCartOpen] = useState(false);

    // â”€â”€ Fetch Product â”€â”€
    const { data: product, isLoading, error } = useQuery<Product | null>({
        queryKey: ["public-product", id],
        queryFn: async () => {
            // First attempt: merchant_marketing_products
            let { data } = await (supabase.from("merchant_marketing_products") as any)
                .select("id, title, short_description, image_url, video_url, external_link, price_label, cta_label, merchant_store_id, category, condition")
                .eq("id", id)
                .maybeSingle();

            // Fallback: advertiser_listings
            if (!data) {
                const { data: advData, error: advErr } = await (supabase.from("advertiser_listings") as any)
                    .select("id, title, description, cover_image_url, price, advertiser_account_id, category, condition, advertiser_listing_media(media_url)")
                    .eq("id", id)
                    .maybeSingle();

                if (advErr) {
                    console.error("Error fetching advertiser_listings:", advErr);
                }

                if (advData) {
                    // Fetch advertiser_account to get user_id safely
                    const { data: accData } = await (supabase.from("advertiser_accounts") as any)
                        .select("user_id")
                        .eq("id", advData.advertiser_account_id)
                        .maybeSingle();

                    // Resolve image: cover_image_url → first media row; convert storage path to public URL
                    const mediaFallback = advData.advertiser_listing_media?.[0]?.media_url ?? null;
                    let resolvedImg: string | null = advData.cover_image_url || mediaFallback;
                    if (resolvedImg && !/^https?:\/\//i.test(resolvedImg)) {
                        resolvedImg = supabase.storage.from('marketing-materials').getPublicUrl(resolvedImg).data.publicUrl;
                    }

                    data = {
                        id: advData.id,
                        title: advData.title,
                        short_description: advData.description,
                        image_url: resolvedImg,
                        video_url: null,
                        external_link: null,
                        price_label: advData.price?.toString(),
                        cta_label: null,
                        merchant_store_id: advData.advertiser_account_id,
                        seller_user_id: accData?.user_id, // Ensure we pass the owner for profiles fallback
                        category: advData.category,
                        condition: advData.condition
                    };
                }
            }

            return data;
        },
        enabled: !!id,
    });

    // Cart must be after product query but hooks are unconditional â€” useStoreCart handles undefined
    const cart = useStoreCart(product?.merchant_store_id);
    const globalCart = useGlobalCart();
    const { trackProductVisit } = useMarketplaceTracking();

    // â”€â”€ Fetch Store info â”€â”€
    const { data: store } = useQuery<StoreData | null>({
        queryKey: ["public-store", product?.merchant_store_id],
        queryFn: async () => {
            let storeRow: any = null;
            let realStoreId = product!.merchant_store_id;
            let resolvedUserId = (product as any).seller_user_id || null;
            
            // 1. Tentar buscar a loja real pelo ID fornecido
            const { data: directStore } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("id", realStoreId)
                .maybeSingle();

            if (directStore) {
                storeRow = directStore;
                resolvedUserId = directStore.user_id || resolvedUserId;
            } else if (resolvedUserId) {
                // 2. Tentar buscar a loja ligada a este usuário (se o ID original era advertiser_account_id)
                const { data: userStore } = await (supabase.from("merchant_stores") as any)
                    .select("*")
                    .eq("user_id", resolvedUserId)
                    .maybeSingle();
                if (userStore) {
                    storeRow = userStore;
                    realStoreId = userStore.id; // Corrige o routing para a loja real!
                }
            }

            if (!storeRow) {
                storeRow = { id: realStoreId, user_id: resolvedUserId };
            }

            const data = storeRow;

            // Fetch profile for phone/whatsapp and extra store info
            let profile: any = {};
            const finalUserId = resolvedUserId;
            
            if (finalUserId) {
                const { data: profileData } = await (supabase.from("profiles") as any)
                    .select("*")
                    .eq("id", finalUserId)
                    .maybeSingle();
                if (profileData) profile = profileData;
            }

            const resolvedPhone = profile.telefone || null;
            const fullStoreName = data.nome_loja || profile.nome_loja || profile.full_name || profile.name || "Vendedor Local";

            // Build full address from merchant_stores, fallback to profiles
            const storeRua = data.rua || data.endereco || profile.rua || null;
            const storeNumero = data.numero || null;
            const storeComplemento = data.complemento || null;
            const fullAddress = [storeRua, storeNumero, storeComplemento].filter(Boolean).join(', ') || null;

            return {
                store_name: fullStoreName,
                city: data.cidade || profile.cidade || null,
                region: data.estado || profile.estado || null,
                bairro: data.bairro || profile.bairro || null,
                address: fullAddress,
                cep: data.cep || profile.cep || null,
                phone: resolvedPhone,
                whatsapp: resolvedPhone,
                logo_url: data.logo_url || profile.logo_url || null,
                categoria: profile.categoria || null,
                store_id: realStoreId, // ID corrigido para direcionar pra loja real
                merchant_user_id: finalUserId,
            };
        },
        enabled: !!product?.merchant_store_id,
    });

    // â”€â”€ Fetch related products from same store â”€â”€
    const { data: relatedProducts = [] } = useQuery<Product[]>({
        queryKey: ["related-products", product?.merchant_store_id, id],
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_marketing_products") as any)
                .select("id, title, short_description, image_url, video_url, external_link, price_label, cta_label, merchant_store_id, category, condition")
                .eq("merchant_store_id", product!.merchant_store_id)
                .eq("is_active", true)
                .neq("id", id)
                .order("created_at", { ascending: false })
                .limit(12);
            return data || [];
        },
        enabled: !!product?.merchant_store_id && !!id,
        staleTime: 60_000,
    });

    // â”€â”€ Auto-scroll slider every 9 seconds â”€â”€
    useEffect(() => {
        const el = sliderRef.current;
        if (!el) return;
        const interval = setInterval(() => {
            const { scrollTop, scrollHeight, clientHeight } = el;
            const maxScroll = scrollHeight - clientHeight;
            if (maxScroll <= 0) return;
            if (scrollTop >= maxScroll - 10) {
                el.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                el.scrollBy({ top: 160, behavior: 'smooth' });
            }
        }, 9000);
        return () => clearInterval(interval);
    }, [relatedProducts]);

    const style = parseCardStyle(product?.cta_label || null);
    const imgSrc = normalizeImageUrl(product?.image_url);
// â”€â”€ M1: Track product_click on page load â”€â”€
    useEffect(() => {
        if (product?.merchant_store_id && store) {
            trackM1Event({
                merchant_store_id: product.merchant_store_id,
                product_id: product.id,
                event_type: "product_click",
                city: store.city,
                region: store.region,
                bairro: store.bairro,
            });
        }
    }, [product?.id, product?.merchant_store_id, store]);

    // â”€â”€ Marketplace Tracking: product_visit â”€â”€
    useEffect(() => {
        if (product && product.id) {
            trackProductVisit(product.id, product.merchant_store_id, {
                source: "product_page",
                page: window.location.pathname,
                product_title: product.title,
                store_name: store?.store_name,
                category_name: product.category,
                city: store?.city,
                state: store?.region,
                neighborhood: store?.bairro
            });
        }
    }, [product, store, trackProductVisit]);

    // ── Credit Deduction: -1 credit per product view ──
    useEffect(() => {
        if (!product?.id || !store?.store_id) return;

        const deductKey = `credit_deducted_${product.id}`;
        if (sessionStorage.getItem(deductKey)) return; // Already charged this session

        const deductCredit = async () => {
            try {
                // Resolve the real merchant_store_id
                let realStoreId = store.store_id!;

                const { data: storeCheck } = await (supabase.from("merchant_stores") as any)
                    .select("id")
                    .or(`id.eq.${realStoreId},user_id.eq.${realStoreId}`)
                    .maybeSingle();

                if (!storeCheck) {
                    // Try via advertiser_accounts → user_id → merchant_stores
                    const { data: accRow } = await (supabase.from("advertiser_accounts") as any)
                        .select("user_id")
                        .eq("id", realStoreId)
                        .maybeSingle();
                    if (accRow?.user_id) {
                        const { data: msRow } = await (supabase.from("merchant_stores") as any)
                            .select("id")
                            .eq("user_id", accRow.user_id)
                            .maybeSingle();
                        if (msRow) realStoreId = msRow.id;
                        else return; // No store found
                    } else {
                        return;
                    }
                } else {
                    realStoreId = storeCheck.id;
                }

                // Get current wallet balance
                const { data: wallet } = await (supabase.from("store_credit_wallet") as any)
                    .select("balance")
                    .eq("store_id", realStoreId)
                    .maybeSingle();

                if (!wallet || (wallet.balance ?? 0) < 1) {
                    console.log("[CreditDeduct] Store has no credits, skipping");
                    return;
                }

                // Deduct 1 credit
                const newBalance = wallet.balance - 1;
                await (supabase.from("store_credit_wallet") as any)
                    .update({ balance: newBalance, updated_at: new Date().toISOString() })
                    .eq("store_id", realStoreId);

                // Record transaction
                await (supabase.from("credit_transactions") as any).insert({
                    store_id: realStoreId,
                    credits: 1,
                    transaction_type: "product_view",
                    description: `Visualização: "${product.title}" por visitante`,
                });

                sessionStorage.setItem(deductKey, "1");
                console.log(`[CreditDeduct] -1 credit from store ${realStoreId} for product ${product.id}`);
            } catch (err) {
                console.error("[CreditDeduct] Error:", err);
            }
        };

        deductCredit();
    }, [product?.id, store?.store_id]);

    const handleCTA = async () => {
        console.log("[handleCTA] store:", store, "product:", product?.id);

        // M1: Track buy_click
        if (product?.merchant_store_id) {
            trackM1Event({
                merchant_store_id: product.merchant_store_id,
                product_id: product.id,
                event_type: "buy_click",
                city: store?.city,
                region: store?.region,
                bairro: store?.bairro,
            });
        }
        // Track contact_seller event (existing)
        if (product) {
            trackProductEvent({
                product_id: product.id,
                store_id: product.merchant_store_id,
                event_type: "contact_seller" as any,
                city: store?.city,
                neighborhood: store?.bairro,
                source: "product_page",
            });
        }

        // Try to resolve phone
        let phone = (store?.whatsapp || store?.phone || "").replace(/\D/g, "");

        // If store data didn't load, try direct phone lookup
        if (!phone && product?.merchant_store_id) {
            try {
                const { data: storeRow } = await (supabase.from("merchant_stores") as any)
                    .select("user_id, whatsapp, phone")
                    .eq("id", product.merchant_store_id)
                    .single();
                if (storeRow) {
                    phone = (storeRow.whatsapp || storeRow.phone || "").replace(/\D/g, "");
                    if (!phone && storeRow.user_id) {
                        const { data: prof } = await (supabase.from("profiles") as any)
                            .select("telefone")
                            .eq("id", storeRow.user_id)
                            .single();
                        if (prof?.telefone) phone = prof.telefone.replace(/\D/g, "");
                    }
                }
            } catch { /* ignore */ }
        }

        console.log("[handleCTA] resolved phone:", phone);

        // Priority: external_link â†’ WhatsApp â†’ lead modal
        if (product?.external_link) {
            window.open(product.external_link, "_blank");
        } else if (phone) {
            // Ensure proper BR format: remove leading 55 if present, then prepend 55
            const cleanPhone = phone.replace(/^55/, '');
            const msg = encodeURIComponent(`OlÃ¡! Vi o produto "${product?.title}" no marketplace Viagg-TX8 e quero comprar!`);
            window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, "_blank");
        } else {
            // Show lead capture modal as fallback
            setShowLeadModal(true);
        }
    };

    // â”€â”€ Loading â”€â”€
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5E62B]">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
                    <p className="text-sm text-gray-400">Carregando produto...</p>
                </div>
            </div>
        );
    }

    // â”€â”€ Not Found â”€â”€
    if (!product || error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5E62B]">
                <div className="text-center space-y-3 px-6">
                    <ShoppingBag className="h-12 w-12 text-gray-200 mx-auto" />
                    <h1 className="text-xl font-bold text-gray-700">Produto não encontrado</h1>
                    <p className="text-sm text-gray-400">Esse produto pode ter sido removido ou o link está incorreto.</p>
                </div>
            </div>
        );
    }

    const socialIcon = product.external_link?.includes("instagram")
        ? <Instagram className="h-4 w-4" />
        : product.external_link?.includes("facebook")
            ? <Facebook className="h-4 w-4" />
            : <Globe className="h-4 w-4" />;

    return (
        <div className="min-h-screen bg-[#F5E62B] flex flex-col">
            {/* â•â•â• TOP BAR (estilo loja) â•â•â• */}
            <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] sticky top-0 z-50 shadow-md">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center gap-4 h-14">
                        <button onClick={() => navigate("/mercado")}
                            className="flex items-center gap-1.5 text-white hover:bg-white/10 rounded-lg px-2 py-1.5 transition-colors">
                            <ArrowLeft className="h-5 w-5" />
                            <span className="text-sm font-bold hidden sm:block">Mercado</span>
                        </button>

                        <div className="flex-1 max-w-2xl mx-auto">
                            <div className="relative flex">
                                <Input
                                    placeholder={`Buscar em ${store?.store_name || "Mercado Local"}...`}
                                    className="w-full pl-4 pr-12 py-2 h-10 rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-sm font-medium focus-visible:ring-0"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            const val = (e.target as HTMLInputElement).value;
                                            if (val.trim()) {
                                                navigate(`/mercado?q=${encodeURIComponent(val.trim())}`);
                                            }
                                        }
                                    }}
                                />
                                <button className="px-4 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-lg flex items-center">
                                    <Search className="h-5 w-5 text-white" />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => {
                                    const priceText = product.price_label ? ` por R$${product.price_label}` : "";
                                    const url = window.location.href;
                                    const text = `ðŸ›’ Confira: *${product.title}*${priceText}\nðŸ”— ${url}`;
                                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                                }}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                title="Compartilhar no WhatsApp"
                            >
                                <Share2 className="h-5 w-5 text-white" />
                            </button>
                            {/* Cart Icon + Badge */}
                            <CartBadge cart={cart} onOpen={() => setCartOpen(true)} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-[#F5E62B]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8">

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    
                    {/* â”€â”€ CENTRAL COLUMN (Loja Hero + Product + AÃ§Ãµes) â”€â”€ */}
                    <div className="xl:col-span-8 flex flex-col gap-6 w-full">
                        
                        {/* â”€â”€ 1. TOPO DA LOJA (Hero Card) â”€â”€ */}
                        {store && (
                            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden p-6 relative">
                                <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: style.bgColor || '#FF6A00' }}></div>
                                
                                <div className="flex items-start sm:items-center gap-4 sm:gap-6 flex-col sm:flex-row">
                                    {/* Logo */}
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-sm border border-zinc-100 flex-shrink-0"
                                        style={{ backgroundColor: style.bgColor ? style.bgColor + '10' : '#f4f4f5' }}>
                                        {normalizeImageUrl(store.logo_url) ? (
                                            <img src={normalizeImageUrl(store.logo_url)!} className="w-full h-full object-cover" alt={store.store_name || "Loja"} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
                                                <Store className="w-8 h-8 text-zinc-400" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Store Info (com Filtro de Privacidade) */}
                                    <div className="flex-1 min-w-0">
                                        {(() => {
                                            const sanitize = (val: string | null | undefined): string | null => {
                                                if (!val) return null;
                                                const s = String(val);
                                                if (s.includes("@")) return null;
                                                if (/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}/.test(s)) return null;
                                                if (/token|cookie|pwd|password|secret|account_id|user_id/i.test(s)) return null;
                                                return s;
                                            };
                                            
                                            const safeStoreName = sanitize(store.store_name) || "Vendedor Local";
                                            const sBairro = sanitize(store.bairro);
                                            const sCity = sanitize(store.city);
                                            const sRegion = sanitize(store.region);

                                            let timidAddress = "Atendimento Local";
                                            if (sBairro && sCity) {
                                                timidAddress = `${sBairro}, ${sCity}${sRegion ? `/${sRegion}` : ""}`;
                                            } else if (sCity) {
                                                timidAddress = `Atendendo na região de ${sCity}${sRegion ? `/${sRegion}` : ""}`;
                                            }

                                            return (
                                                <>
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        {store.categoria && (
                                                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded-full">{store.categoria}</span>
                                                        )}
                                                        <span className="bg-[#FF6A00] text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full">Loja Oficial</span>
                                                    </div>
                                                    <h1 className="font-black text-2xl text-zinc-900 leading-tight truncate mb-1">
                                                        {safeStoreName}
                                                    </h1>
                                                    
                                                    <p className="text-sm font-medium text-zinc-500 flex items-center gap-1.5 mt-2">
                                                        <MapPin className="w-4 h-4 text-[#FF6A00] flex-shrink-0" />
                                                        <span className="truncate">{timidAddress}</span>
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs font-semibold text-green-600 mt-2 bg-green-50 w-max px-2.5 py-1 rounded-md">
                                                        <Truck className="w-3.5 h-3.5" /> Entrega Local Disponível
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    
                                    {/* Botão Ver Loja */}
                                    {store.store_id && (
                                        <div className="w-full sm:w-auto mt-4 sm:mt-0 relative z-10">
                                            <button onClick={(e) => { e.preventDefault(); navigate(`/loja/${store.store_id}`); }}
                                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold shadow-md hover:bg-zinc-800 transition-colors">
                                                <Store className="h-4 w-4" /> Visitar a Loja
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* â”€â”€ 2. PRODUTO EM DESTAQUE â”€â”€ */}
                        <div className="rounded-2xl overflow-hidden bg-white shadow-xl border border-zinc-100" style={{ borderColor: style.cardBg !== '#ffffff' ? style.cardBg : undefined }}>
                            {/* Imagem do Produto */}
                            {imgSrc ? (
                                <div className="relative">
                                    <img src={imgSrc} alt={product.title}
                                        className="w-full aspect-[4/3] md:aspect-[16/9] object-contain bg-zinc-50 border-b border-zinc-100"
                                        onError={e => { e.currentTarget.style.display = "none"; }} />
                                    {/* Price tag overlay opcional, ou manter só no texto */}
                                    {product.price_label && (
                                        <div className="absolute bottom-4 right-4 px-5 py-2 rounded-2xl shadow-lg font-black text-white text-xl md:text-2xl"
                                            style={{ backgroundColor: style.bgColor }}>
                                            R$ {product.price_label}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full aspect-[4/3] md:aspect-[16/9] bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
                                    <ShoppingBag className="h-20 w-20 text-zinc-300" />
                                </div>
                            )}

                            {/* InformaÃ§Ãµes e AÃ§Ãµes */}
                            <div className="p-6 md:p-8 space-y-6 flex flex-col">
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-black leading-tight text-zinc-900 mb-2">
                                        {product.title}
                                    </h2>
                                    {product.short_description && (
                                        <p className="text-base text-zinc-600 leading-relaxed font-medium">
                                            {product.short_description}
                                        </p>
                                    )}
                                </div>

                                {/* Price (se nÃ£o tiver imagem) */}
                                {product.price_label && !imgSrc && (
                                    <p className="text-4xl font-black" style={{ color: style.bgColor }}>
                                        R$ {product.price_label}
                                    </p>
                                )}

                                {/* Category & Condition badges */}
                                {(product.category || product.condition) && (
                                    <div className="flex items-center gap-2 flex-wrap pb-2">
                                        {product.category && (
                                            <span className="text-xs font-bold px-3 py-1 rounded-md bg-blue-50 text-blue-600 flex items-center gap-1">
                                                <Tag className="h-3 w-3" /> {product.category}
                                            </span>
                                        )}
                                        {product.condition === "usado" ? (
                                            <span className="text-xs font-bold px-3 py-1 rounded-md bg-amber-50 text-amber-600">
                                                🔄 Usado
                                            </span>
                                        ) : (
                                            <span className="text-xs font-bold px-3 py-1 rounded-md bg-emerald-50 text-emerald-600">
                                                ✨ Novo
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* ── AÇÕES DO PRODUTO ── */}
                                <div className="pt-5 border-t border-zinc-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Add to Cart */}
                                    {product.merchant_store_id && (
                                        <div className="md:col-span-2">
                                            <AddToCartButton
                                                cart={cart}
                                                productId={product.id}
                                                bgColor={style.bgColor}
                                                onGlobalAdd={() => {
                                                    if (product.merchant_store_id) {
                                                        globalCart.addItem(
                                                            product.merchant_store_id,
                                                            product.id,
                                                            1,
                                                            product.title,
                                                            product.image_url,
                                                            parseFloat(String(product.price_label || "0").replace(",", ".").replace(/[^\d.]/g, "")) || 0,
                                                            store?.store_name || "Loja",
                                                            store?.logo_url || null,
                                                        );
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}


                                    {/* Saber Mais Button */}
                                    <div className="md:col-span-2 flex justify-center">
                                        <button
                                            onClick={() => {
                                                const phone = (store?.whatsapp || store?.phone || "").replace(/\D/g, "");
                                                const cleanPhone = phone.replace(/^55/, '');
                                                const msg = encodeURIComponent(`Olá! Gostaria de saber mais sobre o produto "${product?.title}" anunciado no Viagg-TX8. Pode me dar mais detalhes?`);
                                                if (cleanPhone) {
                                                    window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, "_blank");
                                                } else {
                                                    setShowLeadModal(true);
                                                }
                                            }}
                                            className="w-full max-w-[300px] flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-xl border-2 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition-all"
                                        >
                                            <MessageCircle className="h-4 w-4" />
                                            Falar com Vendedor
                                        </button>
                                    </div>

                                    {/* Video & External */}
                                    {product.video_url && (
                                        <div className="md:col-span-2">
                                            <a href={product.video_url} target="_blank" rel="noopener noreferrer"
                                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 text-sm font-bold transition-colors hover:bg-zinc-50"
                                                style={{ borderColor: style.bgColor, color: style.bgColor }}>
                                                <Video className="h-4 w-4" /> Assistir vídeo de demonstração
                                            </a>
                                        </div>
                                    )}
                                    
                                    {product.external_link && (
                                        <div className="md:col-span-2 text-center mt-2">
                                            <a href={product.external_link} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-blue-500 hover:text-blue-700 transition-colors">
                                                {socialIcon} Visitar link externo
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── 3. ALERTA ANTI-GOLPE ── */}
                        <div className="rounded-2xl border-2 border-red-500 bg-red-50/80 p-5 shadow-sm text-red-900 flex items-start gap-4">
                            <span className="text-3xl flex-shrink-0 mt-0.5">🛡️</span>
                            <div>
                                <p className="text-sm font-black uppercase tracking-tight text-red-700">Alerta de Segurança Anti-Golpe</p>
                                <p className="text-sm font-medium mt-1.5 leading-relaxed text-red-950">
                                    NUNCA faça pagamentos antecipados! A <strong className="font-black text-red-700">Viagg-TX8</strong> conecta você ao vendedor local — não realizamos transações financeiras nem solicitamos PIX. Encontre-se presencialmente ou pague no ato da entrega.
                                </p>
                            </div>
                        </div>

                        <div className="text-center pb-4 mt-8 hidden xl:block">
                            <p className="text-xs text-zinc-400 font-medium tracking-wide">
                                Anúncio processado pela plataforma <span className="font-black text-zinc-500">VIAGG-TX8</span>
                            </p>
                        </div>
                    </div>

                    {/* â”€â”€ RIGHT COLUMN (Mais desta Loja) â”€â”€ */}
                    {relatedProducts.length > 0 && (
                        <div className="xl:col-span-4 w-full flex-shrink-0 xl:sticky xl:top-[120px]">
                            <div className="rounded-2xl bg-white border border-zinc-200 shadow-xl overflow-hidden flex flex-col max-h-[850px]">
                                <div className="px-5 py-5 bg-zinc-900 flex flex-col justify-center">
                                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                                        <Store className="h-5 w-5 text-[#FF6A00]" />
                                        Mais desta Loja
                                    </h3>
                                    <p className="text-xs text-zinc-400 font-medium mt-1">Explore outros produtos</p>
                                </div>
                                <div ref={sliderRef}
                                    className="flex-1 overflow-y-auto"
                                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d8 transparent' }}>
                                    {relatedProducts.map((rp) => {
                                        const rpImg = normalizeImageUrl(rp.image_url);
                                        return (
                                            <div
                                                key={rp.id}
                                                className="flex gap-4 p-4 hover:bg-zinc-50 cursor-pointer transition-all duration-200 group border-b border-zinc-100 last:border-b-0"
                                                onClick={() => {
                                                    if (product?.merchant_store_id) {
                                                        trackM1Event({
                                                            merchant_store_id: product.merchant_store_id,
                                                            product_id: rp.id,
                                                            event_type: "product_click",
                                                            city: store?.city,
                                                            region: store?.region,
                                                            bairro: store?.bairro,
                                                        });
                                                    }
                                                    navigate(`/produto/${rp.id}`);
                                                }}
                                            >
                                                <div className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-100 flex-shrink-0 shadow-sm border border-zinc-200">
                                                    {rpImg ? (
                                                        <img src={rpImg} alt={rp.title}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
                                                            <ShoppingBag className="h-6 w-6 text-zinc-400" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <p className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2 group-hover:text-[#FF6A00] transition-colors">
                                                        {rp.title}
                                                    </p>
                                                    {rp.price_label && (
                                                        <p className="text-base font-black text-zinc-900 mt-1">
                                                            R$ {rp.price_label}
                                                        </p>
                                                    )}
                                                    {rp.category && (
                                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1 block">
                                                            {rp.category}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                            </div>
                            
                            <div className="text-center pb-4 mt-6 xl:hidden">
                                <p className="text-xs text-zinc-400 font-medium tracking-wide">
                                    Anúncio processado pela plataforma <span className="font-black text-zinc-500">VIAGG-TX8</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </div>

            {/* â•â•â• LEAD CAPTURE MODAL â•â•â• */}
            {product && (
                <LeadCaptureModal
                    product={{
                        id: product.id,
                        title: product.title,
                        image_url: product.image_url,
                        price_label: product.price_label,
                        city: store?.city,
                        merchant_store_id: product.merchant_store_id,
                        store_name: store?.store_name,
                    }}
                    open={showContactModal}
                    onClose={() => setShowContactModal(false)}
                />
            )}

            {/* â•â•â• DISCOUNT REQUEST MODAL â•â•â• */}
            {product && (
                <DiscountRequestModal
                    product={{
                        id: product.id,
                        title: product.title,
                        image_url: product.image_url,
                        price_label: product.price_label,
                        city: store?.city,
                        merchant_store_id: product.merchant_store_id,
                        store_name: store?.store_name,
                    }}
                    open={showDiscountModal}
                    onClose={() => setShowDiscountModal(false)}
                />
            )}

            {/* â•â•â• LEAD CAPTURE MODAL â•â•â• */}
            <LeadCaptureModal
                product={product}
                open={showLeadModal}
                onClose={() => setShowLeadModal(false)}
            />

            {/* ---> CART DRAWER <--- */}
            {product?.merchant_store_id && (
                <StoreCartDrawer
                    open={cartOpen}
                    onOpenChange={setCartOpen}
                    storeId={product.merchant_store_id}
                    storeName={store?.store_name || "Loja"}
                    cart={cart}
                />
            )}

            {/* ---> FOOTER <--- */}
            <FooterNeutral compact />
        </div>
    );
}