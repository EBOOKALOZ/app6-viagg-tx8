/**
 * 🏷️ DiscountRequestModal — "Pedir desconto para a loja"
 * 
 * Consumer modal to propose a discount price.
 * Collects: name, phone, desired price, optional message.
 * Creates a "pending" discount request in Supabase.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Percent, Store, MapPin, ShoppingBag, Loader2, CheckCircle, Shield, Tag } from "lucide-react";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";
import { displayPriceLabel } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ──────────────────────────────
interface DiscountProduct {
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

interface DiscountRequestModalProps {
    product: DiscountProduct | null;
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

export default function DiscountRequestModal({ product, open, onClose }: DiscountRequestModalProps) {
    const [store, setStore] = useState<StoreInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Form
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");
    const [requestedPrice, setRequestedPrice] = useState("");
    const [message, setMessage] = useState("");

    // Fetch store info
    useEffect(() => {
        if (!open || !product?.merchant_store_id) {
            setStore(null);
            setSubmitted(false);
            setCustomerName("");
            setCustomerPhone("");
            setCustomerEmail("");
            setRequestedPrice("");
            setMessage("");
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
                        logo_url: data.logo_url || profileData.logo_url || profileData.avatar_url || null,
                    });
                }
            } catch { /* ignore */ }
            finally { setLoading(false); }
        })();
    }, [open, product?.merchant_store_id]);

    if (!product) return null;

    const imgSrc = normalizeImg(product.image_url);

    const handleSubmit = async () => {
        if (!customerName.trim()) { toast.error("Informe seu nome"); return; }
        if (!validatePhone(customerPhone)) { toast.error("Informe um WhatsApp válido com DDD"); return; }
        if (!requestedPrice.trim() || parseFloat(requestedPrice.replace(",", ".")) <= 0) {
            toast.error("Informe o valor que gostaria de pagar");
            return;
        }

        setSubmitting(true);
        try {
            const phoneClean = customerPhone.replace(/\D/g, "");
            const priceNum = parseFloat(requestedPrice.replace(",", "."));

            // Anti-spam: max 3 requests per product per 10 min
            const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data: recent } = await (supabase.from("discount_requests") as any)
                .select("id")
                .eq("product_id", product.id)
                .eq("customer_phone", phoneClean)
                .gte("created_at", tenMinAgo);

            if (recent && recent.length >= 3) {
                toast.error("Limite de pedidos atingido. Tente novamente em 10 minutos.");
                return;
            }

            // Pedido de desconto via RPC SECURITY DEFINER (escrita anônima
            // direta em tabela foi revogada — padrão charge_*/submit_*)
            const { data: rpcRes, error } = await (supabase.rpc as any)("submit_discount_request", {
                p_product_id: product.id,
                p_store_id: product.merchant_store_id,
                p_customer_name: customerName.trim(),
                p_customer_phone: phoneClean,
                p_requested_price: priceNum,
                p_customer_email: customerEmail.trim() || null,
                p_product_price: product.price_label || null,
                p_message: message.trim() || null,
            });

            if (error) throw error;
            if (rpcRes && rpcRes.ok === false) {
                if (rpcRes.error === "rate_limited") {
                    toast.error("Limite de pedidos atingido. Tente novamente em 10 minutos.");
                    return;
                }
                throw new Error(String(rpcRes.error || "falha ao enviar pedido"));
            }

            // Dispara e-mail ao lojista + confirmação ao comprador (sem depender do trigger SQL)
            supabase.functions.invoke('swift-action', {
                body: {
                    source: 'offer',
                    store_id: product.merchant_store_id || null,
                    listing_id: product.id,
                    listing_module: 'product',
                    offer_amount: priceNum,
                    offer_note: message.trim() || "Tenho interesse neste produto. A loja aceita este valor?",
                    customer_name: customerName.trim(),
                    customer_email: customerEmail.trim() || null,
                },
            }).catch((e) => console.warn('[email offer]', e));

            // Track analytics
            trackProductEvent({
                product_id: product.id,
                store_id: product.merchant_store_id,
                event_type: "contact_seller" as any,
                city: store?.city || product.city,
                neighborhood: store?.bairro,
                source: "discount_modal",
            });

            setSubmitted(true);
            toast.success("Pedido de desconto enviado!");
        } catch (err: any) {
            console.error("[DiscountRequestModal] error:", err);
            const msg = err?.message || err?.error_description || err?.details || "Tente novamente";
            toast.error(`Erro ao enviar: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md p-0 gap-0 rounded-2xl border-0 shadow-2xl bg-white text-gray-800 flex flex-col max-h-[92vh] overflow-y-auto">
                {submitted ? (
                    /* ── Success State ── */
                    <div className="p-8 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                            <CheckCircle className="h-8 w-8 text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-black text-gray-800">Pedido Enviado!</h2>
                        <p className="text-sm text-gray-500 leading-relaxed">
                            Seu pedido de desconto para <strong>{product.title}</strong> foi enviado à loja.
                        </p>
                        <p className="text-xs text-gray-400">
                            A loja poderá responder diretamente pelo WhatsApp.
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
                            Continuar Navegando
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── Header ── */}
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-5">
                            <DialogHeader>
                                <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
                                    <Tag className="h-5 w-5" />
                                    Pedir desconto para a loja
                                </DialogTitle>
                            </DialogHeader>
                            <p className="text-xs text-white/80 mt-1">
                                Proponha um valor e a loja decidirá se aceita
                            </p>
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
                                        <p className="text-base font-black text-gray-400 line-through mt-0.5">
                                            {displayPriceLabel(product.price_label)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Store Info */}
                            {loading ? (
                                <div className="flex justify-center py-3">
                                    <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                                </div>
                            ) : store && (
                                <div className="flex items-center gap-2 mt-3 px-1">
                                    {store.logo_url ? (
                                        <img src={store.logo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                    ) : (
                                        <Store className="h-4 w-4 text-[#FF6A00]" />
                                    )}
                                    <span className="text-xs font-bold text-gray-600">{store.store_name}</span>
                                    {(store.city || store.bairro) && (
                                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                            <MapPin className="h-2.5 w-2.5" />
                                            {[store.bairro, store.city].filter(Boolean).join(", ")}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Form ── */}
                        <div className="px-5 pb-3 space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Seu Nome</label>
                                <input
                                    type="text"
                                    placeholder="Como deve te chamar?"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                                    maxLength={100}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Seu WhatsApp</label>
                                <input
                                    type="tel"
                                    placeholder="(47) 99999-9999"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(formatPhone(e.target.value))}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                                    maxLength={15}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                    Seu e-mail <span className="font-normal text-gray-400">(opcional — pra você receber a confirmação)</span>
                                </label>
                                <input
                                    type="email"
                                    placeholder="voce@email.com"
                                    value={customerEmail}
                                    onChange={(e) => setCustomerEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                                    maxLength={120}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                    Qual valor você gostaria de pagar?
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        value={requestedPrice}
                                        onChange={(e) => setRequestedPrice(e.target.value.replace(/[^\d,\.]/g, ""))}
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-bold text-purple-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                                    Mensagem <span className="font-normal text-gray-400">(opcional)</span>
                                </label>
                                <textarea
                                    placeholder="Tenho interesse neste produto. A loja aceita este valor?"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all resize-none"
                                    rows={2}
                                    maxLength={500}
                                />
                            </div>
                        </div>

                        {/* ── Disclaimer ── */}
                        <div className="px-5 pb-3">
                            <div className="flex items-start gap-2 bg-purple-50 rounded-lg p-2.5">
                                <Shield className="h-3.5 w-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                                <p className="text-[10px] text-purple-600 leading-relaxed">
                                    Seu pedido será enviado diretamente à loja. A loja decide se aceita, recusa ou propõe outro valor.
                                </p>
                            </div>
                        </div>

                        {/* ── Submit ── */}
                        <div className="px-5 pb-5">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.98] transition-all shadow-lg hover:shadow-xl disabled:opacity-60"
                            >
                                {submitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Percent className="h-4 w-4" />
                                )}
                                {submitting ? "Enviando..." : "Enviar Oferta"}
                            </button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
