import { useState } from "react";
import {
    Globe, ExternalLink, Link2, Eye, EyeOff,
    Loader2, ShoppingBag, Copy, CheckCircle, MapPin, Plus, Store, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface LandingProduct {
    id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    price_label: string | null;
    cta_label: string | null;
    tracking_slug: string | null;
    is_active: boolean;
    clicks_count: number;
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

// ═══════════════════════════════════════
// MarketplaceLandingCard
// Shows which products are live on /mercado
// ═══════════════════════════════════════
interface MarketplaceLandingCardProps {
    storeId: string | null;
    onAddProduct?: () => void;
    onSelectForPromotion?: (product: { id: string; title: string; short_description: string | null; image_url: string | null; price_label: string | null; cta_label: string | null; tracking_slug: string | null }) => void;
}

export default function MarketplaceLandingCard({ storeId, onAddProduct, onSelectForPromotion }: MarketplaceLandingCardProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // ── Fetch store info ──
    const { data: storeInfo } = useQuery({
        queryKey: ["marketplace-store-info", storeId],
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("id", storeId!)
                .single();
            return data || null;
        },
        enabled: !!storeId,
    });

    const { data: products = [], isLoading } = useQuery<LandingProduct[]>({
        queryKey: ["marketplace-landing-products", user?.id],
        queryFn: async () => {
            const { data, error } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("created_by_user_id", user!.id)
                .order("created_at", { ascending: false });
            return (data || []).map((p: any) => ({
                id: p.id,
                title: p.title || "Sem título",
                short_description: p.short_description || null,
                image_url: p.image_url || null,
                price_label: p.price_label || null,
                cta_label: p.cta_label || null,
                tracking_slug: p.tracking_slug || null,
                is_active: p.is_active ?? false,
                clicks_count: p.clicks_count ?? 0,
            }));
        },
        enabled: !!user,
    });

    // ── Fetch existing delivery products to import ──
    const { data: deliveryProducts = [] } = useQuery<{ id: string; name: string; price: number; image_url: string | null }[]>({
        queryKey: ["delivery-products-for-import", user?.id],
        queryFn: async () => {
            const { data: store } = await (supabase.from("stores") as any)
                .select("id")
                .eq("owner_id", user!.id)
                .limit(1)
                .maybeSingle();
            if (!store) return [];
            const { data } = await supabase
                .from("products")
                .select("id, name, price, image_url")
                .eq("store_id", store.id)
                .order("created_at", { ascending: false });
            return (data || []) as any;
        },
        enabled: !!user,
    });

    const [importingId, setImportingId] = useState<string | null>(null);

    const handleImportProduct = async (dp: { id: string; name: string; price: number; image_url: string | null }) => {
        if (!storeId || !user?.id) return;
        setImportingId(dp.id);
        try {
            const { error } = await (supabase.from("merchant_marketing_products") as any)
                .insert({
                    created_by_user_id: user.id,
                    merchant_store_id: storeId,
                    title: dp.name,
                    price_label: dp.price?.toFixed(2).replace(".", ",") || null,
                    image_url: dp.image_url || null,
                    short_description: dp.name,
                    is_active: true,
                    campaign_type: "offer",
                    cta_label: JSON.stringify({ label: "Comprar", bgColor: "#FF6A00", textColor: "#FFFFFF", cardBg: "#FFFFFF", _showcase: true }),
                });
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["marketplace-landing-products"] });
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
            queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
            queryClient.invalidateQueries({ queryKey: ["all-showcase-products"] });
            toast.success(`"${dp.name}" publicado no Mercado Local!`);
        } catch {
            toast.error("Erro ao importar produto.");
        } finally {
            setImportingId(null);
        }
    };

    const activeProducts = products.filter(p => p.is_active);
    const inactiveProducts = products.filter(p => !p.is_active);

    // Products from delivery that aren't already imported
    const alreadyImportedTitles = new Set(products.map(p => p.title.toLowerCase().trim()));
    const availableToImport = deliveryProducts.filter(dp => !alreadyImportedTitles.has((dp.name || "").toLowerCase().trim()));

    const handleToggle = async (product: LandingProduct) => {
        setTogglingId(product.id);
        try {
            const { error } = await (supabase.from("merchant_marketing_products") as any)
                .update({ is_active: !product.is_active })
                .eq("id", product.id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["marketplace-landing-products"] });
            queryClient.invalidateQueries({ queryKey: ["merchant-marketing-products"] });
            queryClient.invalidateQueries({ queryKey: ["all-showcase-products"] });
            queryClient.invalidateQueries({ queryKey: ["showcase-products"] });
            toast.success(product.is_active ? "Removido do Mercado Local" : "Publicado no Mercado Local!");
        } catch {
            toast.error("Erro ao alterar visibilidade");
        } finally {
            setTogglingId(null);
        }
    };

    const handleCopyLink = (product: LandingProduct) => {
        if (!product.tracking_slug) return;
        const url = `${window.location.origin}/p/${product.tracking_slug}`;
        navigator.clipboard.writeText(url);
        setCopiedId(product.id);
        toast.success("Link rastreável copiado!", { description: url });
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="rounded-2xl border-2 border-blue-200 bg-white shadow-md overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-white" />
                        <div>
                            <h3 className="text-sm font-black text-white tracking-tight">Mercado Local Viagg-TX8</h3>
                            <p className="text-[10px] text-white/70 font-medium">
                                Seus produtos na vitrine pública • {activeProducts.length} publicados
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onAddProduct && (
                            <button
                                onClick={onAddProduct}
                                className="flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 px-2.5 py-1 rounded-lg hover:bg-white/30 transition-colors"
                            >
                                <Plus className="h-3 w-3" /> Adicionar
                            </button>
                        )}
                        <a
                            href="/mercado"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 px-2.5 py-1 rounded-lg hover:bg-white/30 transition-colors"
                        >
                            <ExternalLink className="h-3 w-3" /> Abrir
                        </a>
                    </div>
                </div>

                {/* Store address */}
                {storeInfo && (
                    <div className="mt-2 flex items-start gap-2 bg-white/10 rounded-lg px-3 py-2">
                        <Store className="h-4 w-4 text-white/60 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-white truncate">{storeInfo.store_name}</p>
                            <p className="text-[10px] text-white/60 leading-relaxed">
                                {[storeInfo.address, storeInfo.bairro, storeInfo.city, storeInfo.region]
                                    .filter(Boolean)
                                    .join(" • ")}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-4">
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                    </div>
                ) : products.length === 0 && availableToImport.length === 0 ? (
                    <div className="text-center py-8">
                        <ShoppingBag className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm font-bold text-gray-500">Nenhum produto cadastrado</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                            Crie materiais de divulgação para publicá-los no Mercado Local.
                        </p>
                        {onAddProduct && (
                            <button
                                onClick={onAddProduct}
                                className="mt-3 inline-flex items-center gap-1 px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition-colors"
                            >
                                <Plus className="h-3.5 w-3.5" /> Adicionar Produtos
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Active products — on the landing page */}
                        {activeProducts.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.15em] mb-1 flex items-center gap-1">
                                    <Eye className="h-3 w-3" /> Publicados no Mercado ({activeProducts.length})
                                </p>
                                <p className="text-[10px] text-gray-400 font-medium mb-3 flex items-center gap-1.5">
                                    <Globe className="h-3 w-3 text-blue-400 shrink-0" />
                                    Os produtos exibidos aqui ficarão visíveis na plataforma para os usuários do Mercado Local.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {activeProducts.map(product => {
                                        const style = parseCardStyle(product.cta_label);
                                        const imgSrc = normalizeImageUrl(product.image_url);
                                        const isCopied = copiedId === product.id;
                                        const isToggling = togglingId === product.id;

                                        return (
                                            <div key={product.id}
                                                className="rounded-xl border border-emerald-200 overflow-hidden bg-white hover:shadow-md transition-all group">
                                                {/* Mini preview */}
                                                <div className="flex gap-2 p-2.5">
                                                    {imgSrc ? (
                                                        <img src={imgSrc} alt={product.title}
                                                            className="w-14 h-14 rounded-lg object-cover shrink-0 border border-gray-100"
                                                            onError={e => { e.currentTarget.style.display = "none"; }} />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center shrink-0">
                                                            <ShoppingBag className="h-5 w-5 text-gray-200" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[12px] font-bold text-gray-800 truncate">{product.title}</p>
                                                        {product.price_label && (
                                                            <p className="text-sm font-black" style={{ color: style.bgColor }}>
                                                                R$ {product.price_label}
                                                            </p>
                                                        )}
                                                        {product.clicks_count > 0 && (
                                                            <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                                                                {product.clicks_count} clique{product.clicks_count !== 1 ? "s" : ""}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Badge className="bg-emerald-100 text-emerald-600 border-0 text-[8px] h-4 px-1.5 shrink-0 self-start">
                                                        Ativo
                                                    </Badge>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex border-t border-gray-100">
                                                    {product.tracking_slug && (
                                                        <button
                                                            onClick={() => handleCopyLink(product)}
                                                            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                        >
                                                            {isCopied ? (
                                                                <><CheckCircle className="h-3 w-3" /> Copiado!</>
                                                            ) : (
                                                                <><Link2 className="h-3 w-3" /> Copiar Link</>
                                                            )}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleToggle(product)}
                                                        disabled={isToggling}
                                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors border-l border-gray-100"
                                                    >
                                                        {isToggling ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <><EyeOff className="h-3 w-3" /> Remover</>
                                                        )}
                                                    </button>
                                                    {onSelectForPromotion && (
                                                        <button
                                                            onClick={() => onSelectForPromotion({
                                                                id: product.id,
                                                                title: product.title,
                                                                short_description: product.short_description,
                                                                image_url: product.image_url,
                                                                price_label: product.price_label,
                                                                cta_label: product.cta_label,
                                                                tracking_slug: product.tracking_slug,
                                                            })}
                                                            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold text-orange-500 hover:text-orange-700 hover:bg-orange-50 transition-colors border-l border-gray-100"
                                                        >
                                                            <Megaphone className="h-3 w-3" /> Anunciar grátis
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Inactive products — not on the landing page */}
                        {inactiveProducts.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                                    <EyeOff className="h-3 w-3" /> Não publicados ({inactiveProducts.length})
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {inactiveProducts.map(product => {
                                        const isToggling = togglingId === product.id;
                                        return (
                                            <div key={product.id}
                                                className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50/50 opacity-70 hover:opacity-100 transition-all">
                                                <div className="flex gap-2 p-2.5">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                                        <ShoppingBag className="h-4 w-4 text-gray-300" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-bold text-gray-500 truncate">{product.title}</p>
                                                        {product.price_label && (
                                                            <p className="text-[10px] text-gray-400">R$ {product.price_label}</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleToggle(product)}
                                                        disabled={isToggling}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-500 hover:bg-emerald-50 transition-colors shrink-0 self-center"
                                                    >
                                                        {isToggling ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <><Eye className="h-3 w-3" /> Publicar</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Available delivery products to import */}
                        {availableToImport.length > 0 && (
                            <div>
                                <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
                                    <Plus className="h-3 w-3" /> Seus produtos cadastrados ({availableToImport.length})
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {availableToImport.map(dp => {
                                        const imgSrc = normalizeImageUrl(dp.image_url);
                                        const isImporting = importingId === dp.id;
                                        return (
                                            <div key={dp.id}
                                                className="rounded-xl border-2 border-dashed border-blue-200 overflow-hidden bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50/60 transition-all">
                                                <div className="flex gap-2 p-2.5">
                                                    {imgSrc ? (
                                                        <img src={imgSrc} alt={dp.name}
                                                            className="w-12 h-12 rounded-lg object-cover shrink-0 border border-blue-100"
                                                            onError={e => { e.currentTarget.style.display = "none"; }} />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                                            <ShoppingBag className="h-4 w-4 text-blue-300" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-bold text-gray-700 truncate">{dp.name}</p>
                                                        {dp.price != null && (
                                                            <p className="text-[12px] font-black text-blue-500">
                                                                R$ {dp.price.toFixed(2).replace(".", ",")}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleImportProduct(dp)}
                                                        disabled={isImporting}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors shrink-0 self-center disabled:opacity-50"
                                                    >
                                                        {isImporting ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <><Plus className="h-3 w-3" /> Publicar</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
