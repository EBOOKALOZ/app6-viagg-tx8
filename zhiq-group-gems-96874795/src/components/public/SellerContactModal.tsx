/**
 * 💬 SellerContactModal — "Falar com o vendedor"
 *
 * Modal that opens when user clicks the CTA button on a product card.
 * Shows product info, store info, and a WhatsApp contact button.
 * Records analytics via product_interest_events.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Phone, Store, MapPin, ShoppingBag, X, MessageCircle } from "lucide-react";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";

// ─── Types ──────────────────────────────
interface SellerProduct {
    id: string;
    title: string;
    image_url?: string | null;
    price_label?: string | null;
    city?: string | null;
    merchant_store_id?: string | null;
    store_name?: string | null;
}

interface StoreInfo {
    store_name: string | null;
    whatsapp: string | null;
    phone: string | null;
    city: string | null;
    bairro: string | null;
    logo_url: string | null;
    store_id: string;
}

interface SellerContactModalProps {
    product: SellerProduct | null;
    open: boolean;
    onClose: () => void;
}

// ─── Helpers ────────────────────────────
function normalizeImg(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}

export default function SellerContactModal({ product, open, onClose }: SellerContactModalProps) {
    const navigate = useNavigate();
    const [store, setStore] = useState<StoreInfo | null>(null);
    const [loading, setLoading] = useState(false);

    // ── Fetch store info when modal opens ──
    useEffect(() => {
        if (!open || !product?.merchant_store_id) {
            setStore(null);
            return;
        }

        setLoading(true);
        (async () => {
            try {
                const { data } = await (supabase.from("merchant_stores") as any)
                    .select("id, store_name, whatsapp, phone, city, bairro, logo_url, user_id")
                    .eq("id", product.merchant_store_id)
                    .single();

                if (data) {
                    // Try to get profile data for fallback
                    let profileData: any = {};
                    if (data.user_id) {
                        const { data: prof } = await (supabase.from("profiles") as any)
                            .select("nome_loja, logo_url, cidade, bairro, whatsapp, telefone")
                            .eq("id", data.user_id)
                            .single();
                        if (prof) profileData = prof;
                    }

                    setStore({
                        store_name: data.store_name || profileData.nome_loja || product.store_name || "Loja",
                        whatsapp: data.whatsapp || profileData.whatsapp || data.phone || profileData.telefone || null,
                        phone: data.phone || profileData.telefone || null,
                        city: data.city || profileData.cidade || product.city || null,
                        bairro: data.bairro || profileData.bairro || null,
                        logo_url: data.logo_url || profileData.logo_url || null,
                        store_id: data.id,
                    });
                }
            } catch (err) {
                console.debug("[SellerContactModal] store fetch error:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, [open, product?.merchant_store_id]);

    if (!product) return null;

    const imgSrc = normalizeImg(product.image_url);
    const whatsappNumber = (store?.whatsapp || store?.phone || "").replace(/\D/g, "");
    const whatsappMsg = encodeURIComponent(
        `Olá, vi o produto "${product.title}" no marketplace e quero mais informações.`
    );
    const whatsappUrl = whatsappNumber
        ? `https://wa.me/${whatsappNumber}?text=${whatsappMsg}`
        : null;

    const handleWhatsAppClick = () => {
        // Track contact_seller event
        trackProductEvent({
            product_id: product.id,
            store_id: product.merchant_store_id,
            event_type: "contact_seller" as any,
            city: store?.city || product.city,
            neighborhood: store?.bairro,
            source: "product_modal",
        });

        if (whatsappUrl) {
            window.open(whatsappUrl, "_blank");
        }
    };

    const handleViewStore = () => {
        onClose();
        if (product.merchant_store_id) {
            navigate(`/loja/${product.merchant_store_id}`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
                {/* Header */}
                <DialogHeader className="p-5 pb-3">
                    <DialogTitle className="text-lg font-black text-gray-800 flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-[#FF6A00]" />
                        Falar com o vendedor
                    </DialogTitle>
                </DialogHeader>

                {/* Product Info */}
                <div className="px-5 pb-4">
                    <div className="flex gap-3 bg-gray-50 rounded-xl p-3">
                        {/* Product Image */}
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-gray-100">
                            {imgSrc ? (
                                <img
                                    src={imgSrc}
                                    alt={product.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <ShoppingBag className="h-6 w-6 text-gray-200" />
                                </div>
                            )}
                        </div>

                        {/* Product Details */}
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-gray-800 line-clamp-2 leading-snug">
                                {product.title}
                            </h3>
                            {product.price_label && (
                                <p className="text-lg font-black text-[#FF6A00] mt-1">
                                    R$ {product.price_label}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Store Info */}
                <div className="px-5 pb-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#FF6A00] border-t-transparent" />
                        </div>
                    ) : store ? (
                        <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                {store.logo_url ? (
                                    <img
                                        src={store.logo_url}
                                        alt={store.store_name || ""}
                                        className="w-10 h-10 rounded-full object-cover border border-gray-100"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                                        <Store className="h-5 w-5 text-[#FF6A00]" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-800 truncate">
                                        {store.store_name}
                                    </p>
                                    {(store.city || store.bairro) && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3" />
                                            {[store.bairro, store.city].filter(Boolean).join(", ")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 text-center py-2">
                            Informações da loja indisponíveis
                        </p>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="px-5 pb-5 space-y-2.5">
                    {/* WhatsApp Button */}
                    <button
                        onClick={handleWhatsAppClick}
                        disabled={!whatsappUrl}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 active:scale-[0.98] transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Phone className="h-4.5 w-4.5" />
                        Falar no WhatsApp
                    </button>

                    {/* View Store Button */}
                    {product.merchant_store_id && (
                        <button
                            onClick={handleViewStore}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-[#FF6A00] border-2 border-[#FF6A00] hover:bg-orange-50 active:scale-[0.98] transition-all duration-200"
                        >
                            <Store className="h-4 w-4" />
                            Ver mais produtos da loja
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
