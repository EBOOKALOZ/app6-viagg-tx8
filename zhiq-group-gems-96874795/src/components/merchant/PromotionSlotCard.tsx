import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import {
    Target, Plus, X, ImagePlus, Megaphone, Send,
    Loader2, ArrowRight, Link2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────
function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}

interface SlotProduct {
    id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    price_label: string | null;
    cta_label: string | null;
    tracking_slug: string | null;
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
    return { label: "Comprar", bgColor: "#FF6A00", textColor: "#1A1A2E", cardBg: "#FFFFFF" };
}

interface PromotionSlotCardProps {
    storeId: string | null;
}

export interface PromotionSlotCardRef {
    addProduct: (product: SlotProduct) => boolean;
}

const PromotionSlotCard = forwardRef<PromotionSlotCardRef, PromotionSlotCardProps>(function PromotionSlotCard({ storeId }, ref) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [slots, setSlots] = useState<(SlotProduct | null)[]>([null, null, null]);
    const [pickingSlot, setPickingSlot] = useState<number | null>(null);
    const [isDispatching, setIsDispatching] = useState(false);

    // Expose addProduct to parent via ref
    useImperativeHandle(ref, () => ({
        addProduct: (product: SlotProduct) => {
            const emptyIndex = slots.findIndex(s => s === null);
            if (emptyIndex === -1) {
                toast.error("Todos os 3 slots já estão ocupados.");
                return false;
            }
            if (slots.some(s => s?.id === product.id)) {
                toast.error("Produto já selecionado.");
                return false;
            }
            const updated = [...slots];
            updated[emptyIndex] = product;
            setSlots(updated);
            toast.success(`"${product.title}" adicionado ao slot ${emptyIndex + 1}!`);
            return true;
        },
    }), [slots]);

    // ── All products (to pick from) ──
    const { data: allProducts = [] } = useQuery<SlotProduct[]>({
        queryKey: ["all-showcase-products", user?.id],
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("created_by_user_id", user!.id)
                .order("created_at", { ascending: false });
            return (data || []).map((p: any) => ({
                id: p.id,
                title: p.title || "Sem título",
                short_description: p.short_description,
                image_url: p.image_url,
                price_label: p.price_label,
                cta_label: p.cta_label,
                tracking_slug: p.tracking_slug || null,
            }));
        },
        enabled: !!user,
    });

    // ── Auto-populate slots with first 3 products ──
    const [autoFilled, setAutoFilled] = useState(false);
    useEffect(() => {
        if (!autoFilled && allProducts.length > 0) {
            const initial: (SlotProduct | null)[] = [
                allProducts[0] || null,
                allProducts[1] || null,
                allProducts[2] || null,
            ];
            setSlots(initial);
            setAutoFilled(true);
        }
    }, [allProducts, autoFilled]);

    // ── Handlers ──
    const pickProduct = (product: SlotProduct) => {
        if (pickingSlot === null) return;
        // Check if already selected in another slot
        if (slots.some(s => s?.id === product.id)) {
            toast.error("Produto já selecionado.");
            return;
        }
        const updated = [...slots];
        updated[pickingSlot] = product;
        setSlots(updated);
        setPickingSlot(null);
    };

    const clearSlot = (index: number) => {
        const updated = [...slots];
        updated[index] = null;
        setSlots(updated);
    };

    const filledSlots = slots.filter(Boolean) as SlotProduct[];

    const handleDispatchAll = async () => {
        if (filledSlots.length === 0) { toast.error("Selecione ao menos 1 produto."); return; }
        if (!storeId) { toast.error("Loja não encontrada."); return; }
        setIsDispatching(true);
        try {
            // Fetch store info
            const { data: store } = await (supabase.from("merchant_stores") as any)
                .select("city, region, bairro")
                .eq("id", storeId)
                .single();

            for (const product of filledSlots) {
                const { error } = await (supabase.rpc as any)("create_merchant_campaign_queue_item", {
                    p_merchant_store_id: storeId,
                    p_created_by_user_id: user?.id,
                    p_title: product.title,
                    p_message_text: product.short_description || null,
                    p_media_url: product.image_url || null,
                    p_campaign_type: "store_product",
                    p_target_city: store?.city || null,
                    p_target_region: store?.region || null,
                    p_target_bairro: store?.bairro || null,
                    p_priority: 2,
                    p_source_type: "merchant_marketing_product",
                    p_source_id: product.id,
                });
                if (error) throw error;
            }

            toast.success(`${filledSlots.length} produto(s) disparado(s)!`);
            queryClient.invalidateQueries({ queryKey: ["lojista-campaigns"] });
            queryClient.invalidateQueries({ queryKey: ["merchant-campaigns"] });
            setSlots([null, null, null]);
        } catch (err: any) {
            toast.error(err?.message || "Erro ao disparar.");
        } finally {
            setIsDispatching(false);
        }
    };

    return (
        <>
            <div className="rounded-2xl border-2 border-orange-200 bg-white shadow-md overflow-hidden">
                {/* Card Header */}
                <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-white" />
                        <div>
                            <h3 className="text-sm font-black text-white tracking-tight">Selecionar para Anunciar Grátis</h3>
                            <p className="text-[10px] text-white/70 font-medium">Escolha até 3 produtos para anunciar grátis na plataforma</p>
                        </div>
                    </div>
                    <span className="text-xs font-black text-white bg-white/20 px-2.5 py-1 rounded-lg">
                        {filledSlots.length}/3
                    </span>
                </div>

                {/* 3 Slots */}
                <div className="grid grid-cols-3 gap-3 p-4">
                    {slots.map((slot, i) => (
                        <div key={i}>
                            {slot ? (() => {
                                const style = parseCardStyle(slot.cta_label);
                                return (
                                /* ── Filled Slot ── */
                                <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all relative group"
                                    style={{ backgroundColor: style.cardBg }}>
                                    {/* Remove button */}
                                    <button
                                        onClick={() => clearSlot(i)}
                                        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                    {/* Slot Number */}
                                    <div className="absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-black shadow"
                                        style={{ backgroundColor: style.bgColor }}>
                                        {i + 1}
                                    </div>
                                    {/* Image */}
                                    {normalizeImageUrl(slot.image_url) ? (
                                        <img src={normalizeImageUrl(slot.image_url)!} alt={slot.title}
                                            className="w-full aspect-[4/3] object-cover"
                                            onError={e => { e.currentTarget.style.display = "none"; }} />
                                    ) : (
                                        <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                                            <ImagePlus className="h-8 w-8 text-gray-200" />
                                        </div>
                                    )}
                                    {/* Info */}
                                    <div className="p-3 space-y-1.5">
                                        <p className="text-[12px] font-bold truncate leading-tight" style={{ color: style.textColor }}>{slot.title}</p>
                                        {slot.short_description && (
                                            <p className="text-[10px] line-clamp-2 leading-relaxed" style={{ color: style.textColor, opacity: 0.6 }}>{slot.short_description}</p>
                                        )}
                                        {slot.price_label ? (
                                            <p className="text-base font-black" style={{ color: style.bgColor }}>R$ {slot.price_label}</p>
                                        ) : (
                                            <p className="text-[10px] italic" style={{ color: style.textColor, opacity: 0.3 }}>Sem preço definido</p>
                                        )}
                                        <button className="w-full text-[11px] font-bold py-1.5 rounded-lg transition-opacity hover:opacity-90 mt-1"
                                            style={{ backgroundColor: style.bgColor, color: "#fff" }}>
                                            {style.label}
                                        </button>
                                        {/* Tracking Link */}
                                        {slot.tracking_slug && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const url = `${window.location.origin}/p/${slot.tracking_slug}`;
                                                    navigator.clipboard.writeText(url);
                                                    toast.success('Link rastreável copiado!', {
                                                        description: url,
                                                    });
                                                }}
                                                className="w-full flex items-center justify-center gap-1 text-[9px] font-bold py-1 rounded-md mt-1 transition-colors hover:bg-gray-100"
                                                style={{ color: style.textColor, opacity: 0.6 }}
                                            >
                                                <Link2 className="h-3 w-3" /> Copiar Link
                                            </button>
                                        )}
                                    </div>
                                </div>
                                );
                            })() : (
                                /* ── Empty Slot ── */
                                <div
                                    className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 flex flex-col items-center justify-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-all aspect-square"
                                    onClick={() => setPickingSlot(i)}
                                >
                                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mb-1.5">
                                        <span className="text-[10px] font-black text-gray-400">{i + 1}</span>
                                    </div>
                                    <Plus className="h-5 w-5 text-gray-300 mb-1" />
                                    <p className="text-[9px] font-bold text-gray-400 text-center leading-snug">Anunciar<br/>grátis</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Dispatch Button */}
                {filledSlots.length > 0 && (
                    <div className="px-4 pb-4">
                        <Button onClick={handleDispatchAll} disabled={isDispatching}
                            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl h-10 shadow-md">
                            {isDispatching
                                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Disparando...</>
                                : <><Send className="h-4 w-4 mr-2" /> Disparar {filledSlots.length} Produto{filledSlots.length > 1 ? "s" : ""}</>}
                        </Button>
                    </div>
                )}
            </div>

            {/* ═══ MODAL: SELECIONAR PRODUTO ═══ */}
            <Dialog open={pickingSlot !== null} onOpenChange={() => setPickingSlot(null)}>
                <DialogContent className="max-w-md bg-white border-gray-200 text-gray-800">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-orange-500" />
                            Selecionar para Anunciar Grátis — Slot {pickingSlot !== null ? pickingSlot + 1 : ""}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Escolha um produto para anunciar gratuitamente na plataforma.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pt-2">
                        {allProducts.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-medium">Nenhum produto ativo.</p>
                                <p className="text-xs mt-1">Crie um produto na Vitrine primeiro.</p>
                            </div>
                        ) : (
                            allProducts.map(p => {
                                const isAlreadySelected = slots.some(s => s?.id === p.id);
                                return (
                                    <div key={p.id}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                            isAlreadySelected
                                                ? "border-gray-100 opacity-40 cursor-not-allowed"
                                                : "border-gray-100 hover:border-orange-300 hover:bg-orange-50/30",
                                        )}
                                        onClick={() => !isAlreadySelected && pickProduct(p)}>
                                        {normalizeImageUrl(p.image_url) ? (
                                            <img src={normalizeImageUrl(p.image_url)!} alt={p.title}
                                                className="w-14 h-14 rounded-lg object-cover shrink-0" />
                                        ) : (
                                            <div className="w-14 h-14 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                                                <ImagePlus className="h-5 w-5 text-gray-200" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate">{p.title}</p>
                                            {p.price_label && <p className="text-xs font-bold text-orange-500">R$ {p.price_label}</p>}
                                            {p.short_description && <p className="text-[10px] text-gray-400 truncate">{p.short_description}</p>}
                                        </div>
                                        {isAlreadySelected ? (
                                            <span className="text-[9px] font-bold text-gray-300 shrink-0">Já selecionado</span>
                                        ) : (
                                            <span className="text-[9px] font-bold text-orange-500 shrink-0 bg-orange-50 px-2 py-1 rounded-lg">Selecionar</span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
});

export default PromotionSlotCard;
export type { SlotProduct };
