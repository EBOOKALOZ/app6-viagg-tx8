/**
 * 📞 LeadCaptureModal — "Falar com o vendedor"
 * 
 * Modern lead capture flow:
 * 1. Shows product + store info
 * 2. Collects customer name + WhatsApp
 * 3. Creates a locked lead in product_leads
 * 4. Tracks analytics (lead_click)
 * 5. Prevents duplicate leads (2 min cooldown)
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Phone, Store, MapPin, ShoppingBag, MessageCircle, Loader2, CheckCircle, Shield } from "lucide-react";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";
import { toast } from "sonner";

// ─── Types ──────────────────────────────
interface LeadProduct {
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
    city: string | null;
    bairro: string | null;
    logo_url: string | null;
}

interface LeadCaptureModalProps {
    product: LeadProduct | null;
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

function formatPhone(value: string): string {
    const nums = value.replace(/\D/g, "").slice(0, 11);
    if (nums.length <= 2) return nums;
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

function validatePhone(phone: string): boolean {
    const nums = phone.replace(/\D/g, "");
    return nums.length >= 10 && nums.length <= 11;
}

export default function LeadCaptureModal({ product, open, onClose }: LeadCaptureModalProps) {
    const [store, setStore] = useState<StoreInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Customer form
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");

    // Fetch store info
    useEffect(() => {
        if (!open || !product?.merchant_store_id) {
            setStore(null);
            setSubmitted(false);
            setCustomerName("");
            setCustomerPhone("");
            return;
        }

        setLoading(true);
        (async () => {
            try {
                const { data } = await (supabase.from("merchant_stores") as any)
                    .select("store_name, city, bairro, logo_url, user_id")
                    .eq("id", product.merchant_store_id)
                    .single();

                if (data) {
                    let profileData: any = {};
                    if (data.user_id) {
                        const { data: prof } = await (supabase.from("profiles") as any)
                            .select("nome_loja, logo_url, cidade, bairro")
                            .eq("id", data.user_id)
                            .single();
                        if (prof) profileData = prof;
                    }

                    setStore({
                        store_name: data.store_name || profileData.nome_loja || product.store_name || "Loja",
                        city: data.city || profileData.cidade || product.city || null,
                        bairro: data.bairro || profileData.bairro || null,
                        logo_url: data.logo_url || profileData.logo_url || null,
                    });
                }
            } catch { /* ignore */ }
            finally { setLoading(false); }
        })();
    }, [open, product?.merchant_store_id]);

    if (!product) return null;

    const imgSrc = normalizeImg(product.image_url);

    const handleSubmit = async () => {
        if (!customerName.trim()) {
            toast.error("Informe seu nome");
            return;
        }
        if (!validatePhone(customerPhone)) {
            toast.error("Informe um WhatsApp válido com DDD");
            return;
        }

        setSubmitting(true);
        try {
            const phoneClean = customerPhone.replace(/\D/g, "");

            // Try product_leads first, then fallback to product_interest_events
            let inserted = false;

            // Attempt 1: product_leads table
            try {
                // Check duplicate (2 min cooldown)
                const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
                const { data: existing } = await (supabase.from("product_leads") as any)
                    .select("id")
                    .eq("product_id", product.id)
                    .eq("customer_phone", phoneClean)
                    .gte("created_at", twoMinAgo)
                    .limit(1);

                if (existing && existing.length > 0) {
                    toast.info("Seu interesse já foi registrado! O vendedor será notificado.");
                    setSubmitted(true);
                    return;
                }

                // Get pricing (graceful)
                let creditsCost = 1;
                try {
                    if (product.price_label) {
                        const priceNum = parseFloat(product.price_label.replace(",", ".").replace(/[^\d.]/g, ""));
                        if (!isNaN(priceNum)) {
                            const { data: pricing } = await (supabase.from("lead_pricing_rules") as any)
                                .select("credits")
                                .lte("min_price", priceNum)
                                .gte("max_price", priceNum)
                                .limit(1)
                                .single();
                            if (pricing) creditsCost = pricing.credits;
                        }
                    }
                } catch { /* pricing table may not exist */ }

                const { error } = await (supabase.from("product_leads") as any).insert({
                    product_id: product.id,
                    store_id: product.merchant_store_id,
                    product_title: product.title,
                    product_price: product.price_label || null,
                    customer_name: customerName.trim(),
                    customer_phone: phoneClean,
                    status: "locked",
                    credits_cost: creditsCost,
                    source: "landing",
                    city: store?.city || product.city,
                    neighborhood: store?.bairro,
                });

                if (error) throw error;
                inserted = true;
            } catch {
                // product_leads table may not exist, try fallback
            }

            // Attempt 2: product_interest_events fallback (base table columns only)
            if (!inserted) {
                const baseInsert = {
                    product_id: product.id,
                    neighborhood: store?.bairro || product.city || "desconhecido",
                    city: store?.city || product.city || "desconhecido",
                    event_type: "click",
                };

                // Try with metadata first
                try {
                    const { error: err1 } = await (supabase.from("product_interest_events") as any).insert({
                        ...baseInsert,
                        metadata: JSON.stringify({
                            type: "lead",
                            customer_name: customerName.trim(),
                            customer_phone: phoneClean,
                        }),
                    });
                    if (err1) throw err1;
                    inserted = true;
                } catch {
                    // metadata column might not exist either, try bare minimum
                    const { error: err2 } = await (supabase.from("product_interest_events") as any).insert(baseInsert);
                    if (err2) {
                        console.error("[LeadCaptureModal] bare insert error:", err2);
                        throw err2;
                    }
                    inserted = true;
                }
            }

            // Track analytics event
            trackProductEvent({
                product_id: product.id,
                store_id: product.merchant_store_id,
                event_type: "contact_seller" as any,
                city: store?.city || product.city,
                neighborhood: store?.bairro,
                source: "lead_modal",
            });

            setSubmitted(true);
            toast.success("Interesse enviado! O vendedor será notificado.");
        } catch (err: any) {
            console.error("[LeadCaptureModal] error:", err);
            toast.error("Erro ao enviar interesse. Tente novamente.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
                {submitted ? (
                    /* ── Success State ── */
                    <div className="p-8 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                            <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                        <h2 className="text-xl font-black text-gray-800">Interesse Enviado!</h2>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            O vendedor será notificado sobre seu interesse em <strong>{product.title}</strong>.
                            Em breve ele poderá entrar em contato com você.
                        </p>
                        <div className="bg-blue-50 rounded-xl p-3">
                            <p className="text-xs text-blue-600 font-medium">
                                📱 Fique atento ao seu WhatsApp!
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-[#FF6A00] hover:bg-[#e65c00] transition-all"
                        >
                            Fechar
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── Header with Store Info ── */}
                        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8A33] p-5">
                            <DialogHeader>
                                <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
                                    <MessageCircle className="h-5 w-5" />
                                    Falar com o vendedor
                                </DialogTitle>
                            </DialogHeader>

                            {/* Store info inside orange header */}
                            {loading ? (
                                <div className="flex justify-center py-2 mt-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                                </div>
                            ) : store && (
                                <div className="flex items-center gap-3 mt-3 bg-white/15 rounded-xl px-3 py-2.5 backdrop-blur-sm">
                                    {store.logo_url ? (
                                        <img src={store.logo_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white/40 flex-shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                                            <Store className="h-5 w-5 text-white" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{store.store_name}</p>
                                        {(store.city || store.bairro) && (
                                            <p className="text-xs text-white/70 flex items-center gap-1 mt-0.5">
                                                <MapPin className="h-3 w-3" />
                                                {[store.bairro, store.city].filter(Boolean).join(", ")}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Product Info ── */}
                        <div className="px-5 pt-4 pb-3">
                            <div className="flex gap-3 bg-gray-50 rounded-xl p-3">
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-gray-100">
                                    {imgSrc ? (
                                        <img src={imgSrc} alt={product.title}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ShoppingBag className="h-5 w-5 text-gray-200" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-bold text-gray-800 line-clamp-2 leading-snug">
                                        {product.title}
                                    </h3>
                                    {product.price_label && (
                                        <p className="text-lg font-black text-[#FF6A00] mt-0.5">
                                            R$ {product.price_label}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Customer Form ── */}
                        <div className="px-5 pb-4 space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                    Seu Nome
                                </label>
                                <input
                                    type="text"
                                    placeholder="Como deve te chamar?"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                                    maxLength={100}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                    Seu WhatsApp
                                </label>
                                <input
                                    type="tel"
                                    placeholder="(47) 99999-9999"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none transition-all"
                                    maxLength={15}
                                />
                            </div>
                        </div>

                        {/* ── Disclaimer ── */}
                        <div className="px-5 pb-3">
                            <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-2.5">
                                <Shield className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                <p className="text-[10px] text-blue-600 leading-relaxed">
                                    Você está entrando em contato diretamente com a loja. Seus dados serão compartilhados apenas com o vendedor deste produto.
                                </p>
                            </div>
                        </div>

                        {/* ── Submit Button ── */}
                        <div className="px-5 pb-5">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white bg-green-500 hover:bg-green-600 active:scale-[0.98] transition-all shadow-lg hover:shadow-xl disabled:opacity-60"
                            >
                                {submitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Phone className="h-4 w-4" />
                                )}
                                {submitting ? "Enviando..." : "Enviar interesse"}
                            </button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
