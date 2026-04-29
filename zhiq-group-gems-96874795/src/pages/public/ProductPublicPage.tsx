import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
    Package, 
    ArrowLeft, 
    ShoppingCart, 
    ShieldCheck, 
    Zap, 
    FileText, 
    CheckCircle2, 
    Globe, 
    Store,
    Info,
    Share2,
    Loader2,
    Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";

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

export default function ProductPublicPage() {
    const { productId } = useParams();
    const navigate = useNavigate();

    const { data: product, isLoading, error } = useQuery({
        queryKey: ["product-details", productId],
        queryFn: async () => {
            if (!productId) return null;
            const { data, error } = await supabase
                .from("merchant_products" as any)
                .select("id, nome, descricao, preco, imagem_url, user_id")
                .eq("id", productId)
                .single();
            if (error) throw error;
            return {
                id: data.id,
                title: data.nome,
                description: data.descricao,
                price: data.preco,
                cover_image_url: data.imagem_url,
                owner_user_id: data.user_id,
                category_name: "Geral",
                city: '',
                state: '',
                condition: 'new',
                is_digital: false,
                has_invoice: false
            };
        },
        enabled: !!productId,
    });

    // To show store info if available
    const { data: store } = useQuery({
        queryKey: ["product-store", product?.owner_user_id],
        enabled: !!product?.owner_user_id,
        queryFn: async () => {
            const { data } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("id", product.owner_user_id) // Assuming owner matches store ID
                .maybeSingle();
            return data;
        }
    });

    if (isLoading) {
        return (
            <MarketLayout>
                <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4 bg-zinc-50/50">
                    <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
                    <p className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em] animate-pulse">Carregando Vitrine...</p>
                </div>
            </MarketLayout>
        );
    }

    if (error || !product) {
        return (
            <MarketLayout>
                <div className="container py-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <Package className="w-12 h-12" />
                    </div>
                    <h1 className="text-3xl font-black text-zinc-900 tracking-tight uppercase">Produto não encontrado</h1>
                    <p className="text-zinc-500 font-medium">O anúncio que você procura foi removido ou não existe.</p>
                    <Button onClick={() => navigate("/mercado")} className="h-14 px-10 rounded-2xl bg-zinc-900 text-white font-black uppercase text-xs tracking-widest gap-2">
                        <ArrowLeft className="w-4 h-4" /> Voltar ao Mercado
                    </Button>
                </div>
            </MarketLayout>
        );
    }

    const mainImg = normalizeImageUrl(product.cover_image_url);

    // ─── Fetch Review Stats ────────────────
    const { data: stats } = useQuery({
        queryKey: ["product-rating-stats", productId],
        enabled: !!productId,
        queryFn: async () => {
            const { data } = await supabase
                .from("product_rating_stats" as any)
                .select("*")
                .eq("product_id", productId)
                .maybeSingle();
            return data;
        }
    });

    // ─── Fetch Individual Reviews ──────────
    const { data: reviews = [] } = useQuery({
        queryKey: ["product-reviews", productId],
        enabled: !!productId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("product_reviews" as any)
                .select("*, profile:auth.users(email)") // Simplified join, adjust if custom profiles table is used for names
                .eq("product_id", productId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    return (
        <MarketLayout>
            <div className="bg-[#F5E62B] min-h-screen pb-20 animate-in fade-in duration-1000">
                <div className="container max-w-7xl mx-auto px-4 py-8">
                    
                    {/* Breadcrumbs / Back */}
                    <div className="flex items-center justify-between mb-8">
                        <Button 
                            variant="ghost" 
                            onClick={() => navigate(-1)} 
                            className="font-black uppercase text-[10px] tracking-widest text-zinc-400 hover:text-zinc-900 gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Voltar
                        </Button>
                        
                        {stats && stats.review_count > 0 && (
                            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border border-zinc-100">
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <Star key={s} className={cn("w-3 h-3", s <= Math.round(stats.average_rating) ? "text-amber-400 fill-amber-400" : "text-zinc-200 fill-zinc-200")} />
                                    ))}
                                </div>
                                <span className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">
                                    {stats.average_rating} ({stats.review_count} avaliações)
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
                        
                        {/* LEFT: MEDIA GALLERY */}
                        <div className="lg:col-span-7 space-y-6">
                            <Card className="border-none shadow-2xl rounded-[40px] overflow-hidden bg-white ring-1 ring-zinc-100 group">
                                <div className="aspect-square bg-zinc-100 flex items-center justify-center overflow-hidden relative">
                                    {mainImg ? (
                                        <img src={mainImg} alt={product.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                    ) : (
                                        <Package className="w-24 h-24 text-zinc-200" />
                                    )}
                                    {/* Badges Overlay */}
                                    <div className="absolute top-8 left-8 flex flex-col gap-3">
                                        <Badge className="bg-white/90 backdrop-blur-md text-zinc-900 border-none rounded-xl px-4 py-2 font-black uppercase text-[10px] tracking-widest shadow-xl">
                                            {product.condition === 'new' ? '💎 Novo / Original' : '♻️ Seminovo'}
                                        </Badge>
                                        {product.is_digital && (
                                            <Badge className="bg-emerald-600/90 backdrop-blur-md text-white border-none rounded-xl px-4 py-2 font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center gap-2">
                                                <Zap className="w-3.5 h-3.5 fill-white" /> Entrega Instantânea
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* RIGHT: BUY AREA */}
                        <div className="lg:col-span-5 space-y-10">
                            
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-1 w-10 bg-emerald-500 rounded-full" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">
                                        {product.category_name || "Geral"}
                                    </span>
                                </div>
                                <h1 className="text-4xl md:text-5xl font-black text-zinc-900 tracking-tighter leading-[0.95] uppercase">
                                    {product.title}
                                </h1>
                                <div className="flex items-center gap-4 py-2">
                                    {store && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors cursor-pointer border border-zinc-200">
                                            <Store className="w-3.5 h-3.5 text-zinc-500" />
                                            <span className="text-[10px] font-black uppercase tracking-tight text-zinc-600">
                                                Vendido por: <span className="text-zinc-950 underline">{store.store_name}</span>
                                            </span>
                                        </div>
                                    )}
                                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Globe className="w-3 h-3" /> {product.city}, {product.state}
                                    </div>
                                </div>
                            </div>

                            <Card className="border-none shadow-3xl rounded-[40px] bg-white ring-1 ring-zinc-50 p-10 space-y-10">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Valor do Investimento</p>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-black text-zinc-900">R$</span>
                                        <span className="text-6xl font-black text-zinc-900 tracking-tighter">
                                            {formatCurrencyBRL(product.price).replace("R$", "").trim()}
                                        </span>
                                    </div>
                                    {product.is_digital && (
                                        <div className="mt-4 flex items-center gap-2 text-emerald-600">
                                            <ShieldCheck className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-tight italic">Link de download via checkout seguro</span>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <Button 
                                        onClick={() => navigate(`/checkout/produto/${product.id}`)}
                                        className="w-full h-20 rounded-[24px] bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase text-sm tracking-[0.2em] shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <ShoppingCart className="w-6 h-6 mr-3" /> Adquirir Agora
                                    </Button>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Button variant="outline" className="h-14 rounded-2xl border-zinc-100 font-black uppercase text-[10px] tracking-widest text-zinc-500 hover:bg-zinc-50">
                                            <Share2 className="w-4 h-4 mr-2" /> Compartilhar
                                        </Button>
                                        <Button variant="outline" className="h-14 rounded-2xl border-zinc-100 font-black uppercase text-[10px] tracking-widest text-zinc-500 hover:bg-zinc-50">
                                            <Info className="w-4 h-4 mr-2" /> Garantia
                                        </Button>
                                    </div>
                                </div>

                                {/* Digital-Specific Information */}
                                {product.is_digital && (
                                    <div className="bg-emerald-50 rounded-3xl p-6 space-y-4 border border-emerald-100">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded-xl shadow-sm">
                                                <Zap className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                                            </div>
                                            <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">Entrega Atômica</span>
                                        </div>
                                        <p className="text-[11px] font-bold text-emerald-600 leading-relaxed">
                                            Este é um **Produto Digital**. Após a compra, um link exclusivo para download (Software, E-book ou Licença) será liberado na sua área de pedidos.
                                        </p>
                                        <div className="flex items-center gap-4 pt-2 border-t border-emerald-100/50">
                                            <div className="flex items-center gap-1.5 grayscale opacity-60">
                                                <FileText className="w-3.5 h-3.5" />
                                                <span className="text-[9px] font-black uppercase">Seguro</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 grayscale opacity-60">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                <span className="text-[9px] font-black uppercase">Verificado</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </Card>

                            {/* ADM TIP */}
                            <div className="p-8 border-2 border-dashed border-zinc-200 rounded-[32px] flex items-center gap-6">
                                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
                                    <ShieldCheck className="w-7 h-7 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-zinc-900 uppercase tracking-tight">Compra Segura Garantida</p>
                                    <p className="text-[10px] font-medium text-zinc-400">Proteção de dados e suporte total Viagg-TX8.</p>
                                </div>
                            </div>
                        </div>

                        {/* DESCRIPTION & REVIEWS */}
                        <div className="lg:col-span-12 space-y-20 py-20 border-t border-zinc-100">
                            
                            {/* Detailed Description */}
                            <div className="max-w-4xl mx-auto space-y-10">
                                <h3 className="text-3xl font-black text-zinc-900 uppercase tracking-tight flex items-center gap-4">
                                    <div className="w-10 h-1 border-b-4 border-emerald-500" /> Detalhes do Produto
                                </h3>
                                <div className="text-zinc-600 font-medium text-lg leading-relaxed whitespace-pre-line bg-white p-12 rounded-[48px] shadow-sm border border-zinc-50 ring-1 ring-zinc-100/50">
                                    {product.description || "Nenhuma descrição detalhada disponível."}
                                </div>
                            </div>

                            {/* CUSTOMER REVIEWS SECTION */}
                            <div className="max-w-5xl mx-auto space-y-12">
                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                                    <div className="space-y-4">
                                        <h3 className="text-4xl font-black text-zinc-900 uppercase tracking-tighter">Avaliações dos Clientes</h3>
                                        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">Opiniões reais de quem já adquiriu este produto.</p>
                                    </div>
                                    {stats && (
                                        <div className="flex items-center gap-8 bg-white p-8 rounded-[38px] shadow-xl border border-zinc-50">
                                            <div className="text-center space-y-1 pr-8 border-r border-zinc-100">
                                                <p className="text-5xl font-black text-zinc-900 tracking-tighter">{stats.average_rating}</p>
                                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Média Geral</p>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-1">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <Star key={s} className={cn("w-4 h-4", s <= Math.round(stats.average_rating) ? "text-amber-400 fill-amber-400" : "text-zinc-100 fill-zinc-100")} />
                                                    ))}
                                                </div>
                                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest whitespace-nowrap">Baseado em {stats.review_count} avaliações</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {reviews.length === 0 ? (
                                    <div className="bg-zinc-50 rounded-[40px] p-20 text-center border border-dashed border-zinc-200">
                                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6 text-zinc-200">
                                            <Star className="w-8 h-8" />
                                        </div>
                                        <p className="text-zinc-400 font-bold uppercase tracking-widest text-[10px]">Ainda não há avaliações para este produto.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {reviews.map((review) => (
                                            <Card key={review.id} className="border-none shadow-xl rounded-[40px] p-10 bg-white ring-1 ring-zinc-50 overflow-hidden relative">
                                                <div className="space-y-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1">
                                                            {[1, 2, 3, 4, 5].map((s) => (
                                                                <Star key={s} className={cn("w-3.5 h-3.5", s <= review.rating ? "text-amber-400 fill-amber-400" : "text-zinc-100 fill-zinc-100")} />
                                                            ))}
                                                        </div>
                                                        <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest">
                                                            {new Date(review.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    
                                                    <p className="text-zinc-700 font-medium leading-relaxed italic text-base">
                                                        "{review.comment || "Comprador não deixou um comentário."}"
                                                    </p>

                                                    <div className="flex items-center gap-3 pt-4 border-t border-zinc-50">
                                                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-black text-zinc-400 uppercase">
                                                            {review.profile?.email ? review.profile.email[0] : "U"}
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            <p className="text-[10px] font-black text-zinc-900 uppercase">
                                                                {review.profile?.email ? `${review.profile.email.split('@')[0].substring(0, 3)}***` : "Cliente Verificado"}
                                                            </p>
                                                            <div className="flex items-center gap-1 text-[8px] font-black text-emerald-500 uppercase tracking-widest">
                                                                <CheckCircle2 className="w-2.5 h-2.5" /> Compra Confirmada
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                                    <Star className="w-24 h-24 text-zinc-900 fill-current" />
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Additional Specs */}
                            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 pt-20 border-t border-zinc-100">
                                <div className="space-y-6">
                                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Especificações Técnicas</h4>
                                    <div className="space-y-4">
                                        {[
                                            { label: "Condição", value: product.condition === 'new' ? 'Novo' : 'Seminovo' },
                                            { label: "Categoria", value: product.category_name || "Geral" },
                                            { label: "Link Fiscal", value: product.has_invoice ? "Sim (PDF)" : "Não disponível" },
                                            { label: "ID do Produto", value: `#${product.id.substring(0, 8)}` },
                                        ].map((spec, i) => (
                                            <div key={i} className="flex items-center justify-between py-4 border-b border-zinc-50 last:border-0">
                                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tight">{spec.label}</span>
                                                <span className="text-xs font-bold text-zinc-900">{spec.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <Card className="p-10 border-none shadow-2xl rounded-[48px] bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex flex-col justify-between">
                                    <div className="space-y-6">
                                        <h4 className="text-xs font-black text-emerald-200 uppercase tracking-widest opacity-70">Apoio ao Cliente</h4>
                                        <p className="text-sm font-bold leading-relaxed">
                                            Dúvidas sobre este item? Fale com nossa central de suporte 24h ou entre em contato direto com o vendedor através da vitrine.
                                        </p>
                                    </div>
                                    <Button className="w-full h-14 bg-white/10 hover:bg-white/20 border-white/20 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl mt-8">
                                        CENTRAL DE AJUDA
                                    </Button>
                                </Card>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        </MarketLayout>
    );
}

// Simple wrapper to maintain MarketLayout context without nesting issues if MarketLayout uses hooks
function ProductDetailsWrapper({ children }: { children: React.ReactNode }) {
    return children;
}
