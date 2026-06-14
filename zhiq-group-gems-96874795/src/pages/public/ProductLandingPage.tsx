import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FooterNeutral } from "@/components/FooterNeutral";
import { MarketLayout } from "@/components/layout/MarketLayout";
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
                try {
                    await cart.addItem({ productId });
                } catch (e) {
                    console.warn("Could not add to store cart, falling back to global cart", e);
                }
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

    // Cart must be after product and store query so we can use the real store_id
    const cart = useStoreCart(store?.store_id || product?.merchant_store_id);

    // â”€â”€ Fetch related products from same store â”€â”€
    const { data: relatedProducts = [] } = useQuery<Product[]>({
        queryKey: ["related-products", product?.merchant_store_id, id],
        queryFn: async () => {
            const storeKey = product!.merchant_store_id;
            // 1) Produtos do lojista (merchant_marketing_products)
            const { data: mp } = await (supabase.from("merchant_marketing_products") as any)
                .select("id, title, short_description, image_url, video_url, external_link, price_label, cta_label, merchant_store_id, category, condition")
                .eq("merchant_store_id", storeKey)
                .eq("is_active", true)
                .neq("id", id)
                .order("created_at", { ascending: false })
                .limit(24);
            let list = (mp || []) as Product[];
            // 2) Se a loja usa advertiser_listings (mesma conta), busca de la tambem
            if (list.length === 0) {
                const { data: adv } = await (supabase.from("advertiser_listings") as any)
                    .select("id, title, description, cover_image_url, price, category, condition, advertiser_listing_media(media_url)")
                    .eq("advertiser_account_id", storeKey)
                    .in("listing_status", ["active", "published"])
                    .neq("id", id)
                    .order("created_at", { ascending: false })
                    .limit(24);
                list = ((adv || []) as any[]).map((item) => {
                    let img: string | null = item.cover_image_url || item.advertiser_listing_media?.[0]?.media_url || null;
                    if (img && !/^https?:\/\//i.test(img)) {
                        img = supabase.storage.from('marketing-materials').getPublicUrl(img).data.publicUrl;
                    }
                    return {
                        id: item.id, title: item.title, short_description: item.description,
                        image_url: img, video_url: null, external_link: null,
                        price_label: item.price?.toString() ?? null, cta_label: null,
                        merchant_store_id: storeKey, category: item.category, condition: item.condition,
                    } as Product;
                });
            }
            return list;
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
        <MarketLayout mainClassName="bg-[#F5E62B] flex flex-col">
            <div className="flex-1 bg-[#F5E62B] flex flex-col">
            <div className="w-full px-4 lg:px-8 xl:px-12 py-6 lg:py-8 flex-1 flex flex-col">

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

                    {/* ESQUERDA: imagem + titulo + descricao */}
                    <div className="lg:col-span-8 flex flex-col gap-6 w-full">
                        <div className="rounded-2xl overflow-hidden bg-white shadow-xl border border-zinc-100">
                            {imgSrc ? (
                                <div className="relative w-full aspect-[4/3] md:aspect-[16/9] overflow-hidden bg-zinc-100 border-b border-zinc-100">
                                    <img src={imgSrc} aria-hidden="true" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" />
                                    <img src={imgSrc} alt={product.title} className="relative z-10 w-full h-full object-contain" onError={e => { e.currentTarget.style.display = "none"; }} />
                                </div>
                            ) : (
                                <div className="w-full aspect-[4/3] md:aspect-[16/9] bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
                                    <ShoppingBag className="h-20 w-20 text-zinc-300" />
                                </div>
                            )}
                            <div className="p-6 md:p-8 space-y-5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {product.condition === "usado" ? (
                                        <span className="text-xs font-bold px-3 py-1 rounded-md bg-amber-50 text-amber-600">Usado</span>
                                    ) : (
                                        <span className="text-xs font-bold px-3 py-1 rounded-md bg-emerald-50 text-emerald-600">Novo</span>
                                    )}
                                    {product.category && (
                                        <span className="text-xs font-bold px-3 py-1 rounded-md bg-blue-50 text-blue-600 flex items-center gap-1"><Tag className="h-3 w-3" /> {product.category}</span>
                                    )}
                                </div>
                                <h1 className="text-2xl md:text-3xl font-black leading-tight text-zinc-900">{product.title}</h1>
                                {product.short_description && (
                                    <div className="border-t border-zinc-100 pt-5">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-zinc-500 mb-2">Descrição</h3>
                                        <p className="text-[15px] text-zinc-700 leading-relaxed whitespace-pre-line">{product.short_description}</p>
                                    </div>
                                )}
                                {product.video_url && (
                                    <a href={product.video_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-700 hover:text-[#FF6A00]"><Video className="h-4 w-4" /> Assistir vídeo de demonstração</a>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border-2 border-red-700 bg-red-600 p-5 shadow-md text-white flex items-start gap-4">
                            <span className="text-4xl flex-shrink-0 mt-0.5 font-black">!</span>
                            <div>
                                <p className="text-base font-black uppercase tracking-tight text-white">Alerta de Segurança Anti-Golpe</p>
                                <p className="text-sm font-medium mt-1.5 leading-relaxed text-red-50">NUNCA faça pagamentos antecipados! A <strong className="font-black text-white">Viagg-TX8</strong> conecta você ao vendedor local. Encontre-se presencialmente ou pague no ato da entrega.</p>
                            </div>
                        </div>
                    </div>

                    {/* DIREITA: BUY BOX (sticky) */}
                    <div className="lg:col-span-4 w-full lg:sticky lg:top-[120px] flex flex-col gap-4">
                        <div className="rounded-2xl bg-white border border-zinc-200 shadow-xl p-5 md:p-6 space-y-4">
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{product.condition === "usado" ? "Usado" : "Novo"}</p>
                            {product.price_label && (
                                <p className="text-3xl md:text-4xl font-black text-zinc-900 leading-none">R$ {product.price_label}</p>
                            )}
                            <div className="flex items-center gap-2 text-sm font-semibold text-green-600 bg-green-50 w-max px-3 py-1.5 rounded-lg"><Truck className="w-4 h-4" /> Entrega local disponível</div>
                            <div className="space-y-2.5 pt-2">
                                {product.merchant_store_id && (
                                    <AddToCartButton
                                        cart={cart}
                                        productId={product.id}
                                        bgColor={style.bgColor}
                                        onGlobalAdd={() => {
                                            const finalStoreId = store?.store_id || product.merchant_store_id;
                                            if (finalStoreId) {
                                                globalCart.addItem({
                                                    storeId: finalStoreId,
                                                    productId: product.id,
                                                    quantity: 1,
                                                    productTitle: product.title,
                                                    productImageUrl: product.image_url,
                                                    productPrice: parseFloat(String(product.price_label || "0").replace(",", ".").replace(/[^\d.]/g, "")) || 0,
                                                    storeName: store?.store_name || "Loja",
                                                    storeLogo: store?.logo_url || null,
                                                });
                                            }
                                        }}
                                    />
                                )}
                                <button onClick={() => setShowDiscountModal(true)} className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                    <Percent className="h-4 w-4" /> Fazer uma oferta
                                </button>
                                <button onClick={() => setShowLeadModal(true)} className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-xl border-2 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all">
                                    <MessageCircle className="h-4 w-4" /> Falar com o vendedor
                                </button>
                            </div>
                        </div>

                        {store && (
                            <div className="rounded-2xl bg-white border border-zinc-200 shadow-sm p-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-100 flex-shrink-0 bg-zinc-100">
                                        {normalizeImageUrl(store.logo_url) ? (
                                            <img src={normalizeImageUrl(store.logo_url)!} className="w-full h-full object-cover" alt={store.store_name || "Loja"} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center"><Store className="w-6 h-6 text-zinc-400" /></div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="bg-[#FF6A00] text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Loja Oficial</span>
                                        <h3 className="font-black text-zinc-900 leading-tight truncate mt-1">{store.store_name || "Vendedor Local"}</h3>
                                        {(store.bairro || store.city) && (<p className="text-xs text-zinc-500 flex items-center gap-1"><MapPin className="w-3 h-3 text-[#FF6A00]" /> {[store.bairro, store.city].filter(Boolean).join(", ")}{store.region ? "/" + store.region : ""}</p>)}
                                    </div>
                                </div>
                                {store.store_id && (
                                    <button onClick={(e) => { e.preventDefault(); navigate(`/loja/${store.store_id}`); }} className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors">
                                        <Store className="h-4 w-4" /> Visitar a Loja
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {relatedProducts.length > 0 && (
                    <div className="mt-10">
                        <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2 mb-4"><Store className="h-5 w-5 text-[#FF6A00]" /> Mais desta loja</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                            {relatedProducts.map((rp) => {
                                const rpImg = normalizeImageUrl(rp.image_url);
                                return (
                                    <div key={rp.id} onClick={() => { if (product?.merchant_store_id) { trackM1Event({ merchant_store_id: product.merchant_store_id, product_id: rp.id, event_type: "product_click", city: store?.city, region: store?.region, bairro: store?.bairro }); } navigate(`/produto/${rp.id}`); }}
                                        className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-lg transition-all group">
                                        <div className="w-full aspect-square bg-zinc-100 overflow-hidden">
                                            {rpImg ? (<img src={rpImg} alt={rp.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />) : (<div className="w-full h-full flex items-center justify-center"><ShoppingBag className="h-8 w-8 text-zinc-300" /></div>)}
                                        </div>
                                        <div className="p-3">
                                            <p className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2 group-hover:text-[#FF6A00] transition-colors">{rp.title}</p>
                                            {rp.price_label && (<p className="text-base font-black text-zinc-900 mt-1">R$ {rp.price_label}</p>)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}


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

            {/* Rodapé simples — só desktop (no celular não mostra; menu inferior cobre) */}
            <footer className="hidden md:block">
                <div className="bg-blue-600 text-white py-6 px-6 text-center">
                    <p className="text-base font-black">Viagg-TX8 · Mercado Local</p>
                    <p className="text-xs text-blue-100 mt-1">© {new Date().getFullYear()} Viagg-TX8 · Todos os direitos reservados · Desenvolvido pela Viagg-TX8</p>
                </div>
            </footer>
        </MarketLayout>
    );
}