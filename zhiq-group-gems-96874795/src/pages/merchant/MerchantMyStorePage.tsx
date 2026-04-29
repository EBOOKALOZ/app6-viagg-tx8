import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
    Store, Plus, Search, ShoppingBag, Eye, Edit, 
    CheckCircle2, Clock, Loader2, Trash2, ExternalLink, 
    TrendingUp, EyeOff, Package, FileText, MapPin, 
    Award, Star, Users, LayoutGrid, List, ChevronDown,
    Settings, Zap, Sparkles, Filter, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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

// ─── SUB-COMPONENTS ────────────────────────────

const StoreHero = ({ store, metrics }: { store: any, metrics: any }) => {
    const navigate = useNavigate();
    const logoUrl = normalizeImageUrl(store?.logo_url);
    const bannerUrl = normalizeImageUrl(store?.banner_url);

    return (
        <div className="relative mb-12 animate-in slide-in-from-top-4 duration-1000">
            {/* Banner Area */}
            <div className="h-64 lg:h-80 w-full rounded-[48px] overflow-hidden relative shadow-2xl group">
                {bannerUrl ? (
                    <img src={bannerUrl} alt="Store Banner" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#0D0F12] via-[#1B1F24] to-[#0D0F12] flex items-center justify-center opacity-90 transition-all duration-700 group-hover:scale-105">
                        <Sparkles className="w-20 h-20 text-[#FF6A00]/10 opacity-50" />
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                    </div>
                )}
                {/* Overlay for better readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
            </div>

            {/* Profile Info Card Area */}
            <div className="container px-8 -mt-24 relative z-10">
                <Card className="border-none shadow-3xl rounded-[40px] bg-[#1B1F24] ring-1 ring-[#2A3038] overflow-hidden">
                    <div className="p-8 lg:p-12 flex flex-col lg:flex-row items-center lg:items-end gap-10">
                        {/* Avatar */}
                        <div className="relative -mt-16 lg:-mt-24">
                            <div className="w-40 h-40 rounded-[48px] bg-[#14171B] p-3 shadow-2xl ring-1 ring-[#2A3038] relative group overflow-hidden">
                                <div className="w-full h-full rounded-[40px] bg-[#0D0F12] overflow-hidden border border-[#2A3038] flex items-center justify-center translate-y-0 transition-transform duration-500 group-hover:scale-110">
                                    {logoUrl ? (
                                        <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                                    ) : (
                                        <Store className="w-16 h-16 text-[#2A3038]" />
                                    )}
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300 cursor-pointer">
                                    <Edit className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-2.5 rounded-2xl shadow-xl ring-4 ring-white animate-pulse">
                                <Award className="w-5 h-5 fill-current" />
                            </div>
                        </div>

                        {/* Store Main Details */}
                        <div className="flex-1 text-center lg:text-left space-y-4">
                            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                <h1 className="text-4xl lg:text-5xl font-black text-[#F5F7FA] tracking-tighter uppercase leading-none">
                                    {store?.nome_loja || "Minha Loja"}
                                </h1>
                                <Badge className="bg-[#FF6A00]/10 text-[#FF6A00] border-[#FF6A00]/20 rounded-full px-4 h-8 flex items-center gap-2 text-[10px] font-black uppercase ring-1 ring-[#FF6A00]/20">
                                    <Star className="w-3 h-3 fill-current" /> Oficial Viagg-TX8
                                </Badge>
                                <Badge className="bg-[#22C55E] text-white border-none rounded-full px-4 h-8 flex items-center gap-2 text-[10px] font-black uppercase shadow-lg shadow-[#22C55E]/20">
                                    <CheckCircle2 className="w-3 h-3" /> Verificada
                                </Badge>
                            </div>
                            
                            <p className="text-[#A7B0BE] font-medium text-lg leading-relaxed max-w-2xl line-clamp-2">
                                {store?.description || "A maior vitrine de produtos e serviços da sua região. Qualidade e confiança integradas."}
                            </p>

                            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-2">
                                <div className="flex items-center gap-2 text-[#A7B0BE] font-bold text-xs uppercase tracking-widest">
                                    <MapPin className="w-4 h-4 text-[#FF6A00]" /> {store?.bairro || "Centro"}, {store?.cidade || "Viagg City"}
                                </div>
                                <div className="flex items-center gap-2 text-[#A7B0BE] font-bold text-xs uppercase tracking-widest">
                                    <ShoppingBag className="w-4 h-4 text-[#22C55E]" /> {store?.categoria || "Marketplace Geral"}
                                </div>
                            </div>
                        </div>

                        {/* Actions Area */}
                        <div className="flex flex-col gap-3 min-w-[240px]">
                            <Button 
                                onClick={() => {
                                    if (store?.id) {
                                        window.open(`/loja/${store.id}`, "_blank");
                                    } else {
                                        window.open(`/mercado`, "_blank");
                                    }
                                }}
                                className="w-full h-14 bg-[#0D0F12] hover:bg-[#14171B] text-[#F5F7FA] font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 gap-3 border border-[#2A3038]"
                            >
                                <ExternalLink className="w-5 h-5 text-[#FF6A00]" /> Ver Vitrine Pública
                            </Button>
                            <div className="grid grid-cols-2 gap-3">
                                <Button variant="outline" className="h-12 border-[#2A3038] bg-transparent text-[#A7B0BE] hover:bg-[#2A3038] hover:text-[#F5F7FA] hover:shadow-lg transition-all rounded-xl font-black uppercase text-[9px] tracking-widest gap-2">
                                    <Settings className="w-4 h-4" /> Editar
                                </Button>
                                <Button 
                                    onClick={() => navigate("/anunciante/anuncios/novo/produto")}
                                    className="h-12 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-lg shadow-[#FF6A00]/20 gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Novo
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Metrics Footer */}
                    <div className="bg-[#14171B] border-t border-[#2A3038] px-12 py-8 grid grid-cols-2 lg:grid-cols-4 gap-8 divide-x divide-[#2A3038]">
                        {[
                            { label: "Produtos Ativos", value: metrics.active, icon: Package, color: "text-[#22C55E]" },
                            { label: "Total de Vendas", value: "24", icon: Zap, color: "text-[#FF6A00]" },
                            { label: "Avaliações", value: "4.9", icon: Star, color: "text-amber-400" },
                            { label: "Seguidores", value: "1.2k", icon: Users, color: "text-[#A7B0BE]" },
                        ].map((m, idx) => (
                            <div key={idx} className="flex items-center justify-center lg:justify-start gap-4 px-4 first:pl-0">
                                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center bg-[#1B1F24] shadow-sm ring-1 ring-[#2A3038]", m.color)}>
                                    <m.icon className="w-5 h-5 fill-current" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-[#F5F7FA] tracking-tighter leading-none">{m.value}</p>
                                    <p className="text-[9px] font-black text-[#A7B0BE] uppercase tracking-widest mt-1">{m.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
};

const ProductVitrineCard = ({ product, onToggle, onDelete }: { product: any, onToggle: any, onDelete: any }) => {
    const navigate = useNavigate();
    const imgSrc = normalizeImageUrl(product.image_url);
    const hasDiscount = product.original_price && product.original_price > product.price; // We'll infer numeric price for logic

    return (
        <Card className="group border-none shadow-xl hover:shadow-3xl rounded-[32px] bg-[#1B1F24] overflow-hidden transition-all duration-500 hover:-translate-y-2 ring-1 ring-[#2A3038] hover:ring-[#FF6A00]/30">
            <div className="p-4 space-y-5">
                {/* Image Container with Badges */}
                <div className="relative aspect-[4/5] rounded-[24px] overflow-hidden bg-zinc-50 border border-zinc-100">
                    {imgSrc ? (
                        <img src={imgSrc} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={product.title} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-200">
                            <ShoppingBag className="w-12 h-12" />
                        </div>
                    )}
                    
                    {/* Status Badges */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <Badge className={cn(
                            "rounded-lg px-2 h-6 flex items-center gap-1.5 text-[8px] font-black uppercase ring-2 ring-white shadow-lg",
                            product.is_active ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                        )}>
                            {product.is_active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                            {product.is_active ? "Ativo" : "Pausado"}
                        </Badge>
                        {product.is_digital && (
                            <Badge className="bg-zinc-900/90 backdrop-blur-md text-white border-none rounded-lg px-2 h-6 flex items-center gap-1.5 text-[8px] font-black uppercase ring-2 ring-white shadow-lg">
                                <FileText className="w-2.5 h-2.5" /> Digital
                            </Badge>
                        )}
                    </div>

                    {/* Featured/Promotion Badge */}
                    {product.is_featured && (
                        <div className="absolute top-4 right-4 animate-bounce">
                            <div className="bg-orange-600 text-white p-2 rounded-xl shadow-xl ring-2 ring-white">
                                <Sparkles className="w-3.5 h-3.5 fill-current" />
                            </div>
                        </div>
                    )}

                    {/* Quick Hover Actions Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                        <button onClick={() => window.open(`/produto/${product.id}`, "_blank")} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-900 hover:scale-110 transition-transform"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => navigate(`/anunciante/anuncios/novo/produto`)} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-900 hover:scale-110 transition-transform"><Edit className="w-4 h-4" /></button>
                        <button onClick={onToggle} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-zinc-900 hover:scale-110 transition-transform">
                            {product.is_active ? <EyeOff className="w-4 h-4 text-amber-500" /> : <Eye className="w-4 h-4 text-emerald-500" />}
                        </button>
                    </div>
                </div>

                {/* Info Container */}
                <div className="space-y-4 px-1">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black text-[#FF6A00] uppercase tracking-widest">{product.category || "Promoção"}</span>
                        <h3 className="font-black text-[#F5F7FA] text-lg uppercase tracking-tight line-clamp-1 leading-tight">{product.title}</h3>
                    </div>

                    <div className="flex items-end justify-between">
                        <div className="space-y-0.5">
                            {product.original_price && (
                                <p className="text-[10px] font-black text-[#2A3038] line-through tracking-widest">R$ {product.original_price.toFixed(2)}</p>
                            )}
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[#A7B0BE] font-bold text-xs">R$</span>
                                <span className="text-3xl font-black text-[#F5F7FA] tracking-tighter italic">
                                    {product.price_label || "0,00"}
                                </span>
                            </div>
                        </div>
                        <button 
                            onClick={onDelete}
                            className="w-10 h-10 rounded-xl bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444] hover:text-white transition-all flex items-center justify-center"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </Card>
    );
};

// ─── MAIN PAGE ────────────────────────────

export default function MerchantMyStorePage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

    // 1. Fetch Store Info
    const { data: store, isLoading: isLoadingStore } = useQuery({
        queryKey: ["merchant-store-data", user?.id],
        queryFn: async () => {
            if (!user) return null;
            const { data, error } = await (supabase.from("merchant_stores") as any)
                .select("*")
                .eq("user_id", user.id) // Using user_id directly as it's our primary link
                .maybeSingle();
            
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    // 2. Fetch Products
    const { data: products = [], isLoading: isLoadingProducts } = useQuery({
        queryKey: ["merchant-store-products", user?.id, store?.id],
        enabled: !!user && !!store?.id,
        queryFn: async () => {
            const { data, error } = await (supabase.from("merchant_marketing_products") as any)
                .select("*")
                .eq("merchant_store_id", store.id)
                .order("is_featured", { ascending: false })
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        }
    });

    // 3. Actions
    const toggleMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
            const { error } = await (supabase.from("merchant_marketing_products") as any)
                .update({ is_active: !is_active })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["merchant-store-products"] });
            toast.success("Status atualizado com sucesso!");
        },
        onError: (err: any) => toast.error(`Erro: ${err.message}`)
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from("merchant_marketing_products") as any)
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["merchant-store-products"] });
            toast.success("Produto removido com sucesso.");
        },
        onError: (err: any) => toast.error(`Erro: ${err.message}`)
    });

    // 4. Filtering & Metrics
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.title?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "all" || 
            (statusFilter === "active" && p.is_active) || 
            (statusFilter === "paused" && !p.is_active);
        return matchesSearch && matchesStatus;
    });

    const metrics = {
        total: products.length,
        active: products.filter(p => p.is_active).length,
    };

    if (isLoadingStore || isLoadingProducts) {
        return (
            <div className="space-y-12">
                <Skeleton className="w-full h-80 rounded-[48px]" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Skeleton className="h-64 rounded-[32px]" />
                    <Skeleton className="h-64 rounded-[32px]" />
                    <Skeleton className="h-64 rounded-[32px]" />
                    <Skeleton className="h-64 rounded-[32px]" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20">
            {/* HER0 - PREMIUM BRANDING */}
            <StoreHero store={store} metrics={metrics} />

            {/* COMMERCIAL PANEL */}
            <div className="container px-8 space-y-10 animate-in slide-in-from-bottom-6 duration-1000">
                
            {/* FILTERS & TOOLS BAR */}
                <div className="bg-[#0D0F12] backdrop-blur-xl p-3 px-4 rounded-[32px] border border-[#2A3038] shadow-xl flex flex-col md:flex-row gap-4 items-center ring-1 ring-[#2A3038]/50">
                    <div className="relative flex-1 w-full group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2A3038] group-focus-within:text-[#FF6A00] transition-colors" />
                        <Input 
                            placeholder="O que você está procurando na sua vitrine?..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-14 h-14 rounded-[22px] border-[#2A3038] bg-[#1B1F24] font-bold text-sm tracking-tight text-[#F5F7FA] focus-visible:ring-2 ring-[#FF6A00]/20 placeholder:text-[#2A3038] shadow-inner"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 p-2 bg-[#1B1F24] rounded-2xl">
                        {["all", "active", "paused"].map((f) => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f)}
                                className={cn(
                                    "px-6 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                    statusFilter === f 
                                        ? "bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/20" 
                                        : "text-[#A7B0BE] hover:text-[#F5F7FA]"
                                )}
                            >
                                {f === "all" ? "Geral" : f === "active" ? "Ativos" : "Pausados"}
                            </button>
                        ))}
                    </div>

                    <div className="h-8 w-px bg-[#2A3038] hidden md:block" />

                    <div className="flex items-center gap-2">
                         <div className="flex items-center bg-[#1B1F24] border border-[#2A3038] p-1.5 rounded-2xl shadow-sm">
                            <button 
                                onClick={() => setViewMode("grid")}
                                className={cn("p-2.5 rounded-xl transition-all", viewMode === "grid" ? "bg-[#FF6A00]/10 text-[#FF6A00]" : "text-[#2A3038]")}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={() => setViewMode("list")}
                                className={cn("p-2.5 rounded-xl transition-all", viewMode === "list" ? "bg-[#FF6A00]/10 text-[#FF6A00]" : "text-[#2A3038]")}
                            >
                                <List className="w-4 h-4" />
                            </button>
                         </div>
                         <Button variant="outline" className="h-14 w-14 rounded-[22px] border-[#2A3038] bg-[#1B1F24] hover:bg-[#2A3038]">
                             <Filter className="w-5 h-5 text-[#A7B0BE]" />
                         </Button>
                    </div>
                </div>

                {/* PRODUCT SHOWCASE */}
                {filteredProducts.length === 0 ? (
                    <div className="py-24 flex flex-col items-center text-center space-y-10 animate-in zoom-in-95 duration-500">
                        <div className="relative">
                            <div className="w-48 h-48 rounded-[64px] bg-[#1B1F24] border border-[#2A3038] flex items-center justify-center text-[#2A3038] shadow-inner">
                                <ShoppingBag className="w-20 h-20" />
                            </div>
                            <div className="absolute -top-4 -right-4 bg-[#1B1F24] p-6 rounded-[32px] shadow-2xl ring-1 ring-[#2A3038] animate-bounce">
                                <Sparkles className="w-8 h-8 text-[#FF6A00]" />
                            </div>
                        </div>
                        <div className="space-y-4 max-w-md">
                            <h3 className="text-3xl font-black text-[#F5F7FA] uppercase tracking-tighter">Sua Vitrine está Oculta</h3>
                            <p className="text-[#A7B0BE] font-medium text-lg leading-relaxed uppercase tracking-widest text-[10px]">
                                Comece a montar sua vitrine comercial agora. Cadastre seus primeiros produtos e conquiste seu espaço no marketplace.
                            </p>
                        </div>
                        <Button 
                            onClick={() => navigate("/anunciante/anuncios/novo/produto")}
                            className="h-20 px-12 rounded-[28px] bg-[#FF6A00] text-white font-black uppercase tracking-[0.2em] text-xs gap-4 shadow-3xl shadow-[#FF6A00]/20 hover:scale-105 active:scale-95 transition-all hover:bg-[#FF7A1A]"
                        >
                            <Plus className="w-6 h-6" /> Iniciar Cadastro de Produtos
                        </Button>
                    </div>
                ) : (
                    <div className={cn(
                        "transition-all duration-700",
                        viewMode === "grid" 
                            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8" 
                            : "space-y-4"
                    )}>
                        {filteredProducts.map((product) => (
                            <ProductVitrineCard 
                                key={product.id} 
                                product={product} 
                                onToggle={() => toggleMutation.mutate({ id: product.id, is_active: product.is_active })}
                                onDelete={() => {
                                    if (confirm(`Excluir "${product.title}" permanentemente?`)) {
                                        deleteMutation.mutate(product.id);
                                    }
                                }}
                            />
                        ))}
                    </div>
                )}
                
                {/* FOOTER INTELLIGENCE */}
                <div className="border-t border-[#2A3038] pt-12 mt-12 flex flex-col md:flex-row items-center justify-between gap-6 opacity-60 hover:opacity-100 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00]">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] max-w-xs">
                            Sua loja está sendo indexada nos motores de busca do Viagg-TX8 para máxima visibilidade.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <Button variant="ghost" className="text-[9px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-[#FF6A00] gap-2">
                             Dicas de Performance <Plus className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" className="text-[9px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-[#FF6A00] gap-2">
                             Suporte ao Lojista <Globe className="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
