import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
    Download, 
    ShoppingCart, 
    Search, 
    ShieldCheck, 
    Zap, 
    Loader2,
    PackageOpen,
    ExternalLink,
    ChevronRight,
    ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";
import ProductReviewModal from "@/components/marketplace/ProductReviewModal";
import { Star, CheckCircle2 } from "lucide-react";

export default function MyDigitalLibrary() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Evaluation Modal State
    const [reviewModalOpen, setReviewModalOpen] = useState(false);
    const [selectedItemForReview, setSelectedItemForReview] = useState<any>(null);

    const fetchDownloads = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate("/auth");
                return;
            }

            try {
                // Fetch paid orders for this user
                const { data, error } = await supabase
                    .from("purchase_intentions")
                    .select(`
                        id,
                        created_at,
                        payment_status,
                        subtotal,
                        purchase_intention_items (
                            id,
                            product_id,
                            product_title,
                            product_image_url,
                            unit_price
                        )
                    `)
                    .eq("customer_user_id", user.id)
                    .eq("payment_status", "paid")
                    .order("created_at", { ascending: false });

                if (error) throw error;

                // For each digital product, we need the download URL from product_listings
                const enrichedOrders = await Promise.all(data.map(async (order: any) => {
                    const itemsWithLinks = await Promise.all(order.purchase_intention_items.map(async (item: any) => {
                        const { data: product } = await supabase
                            .from("merchant_products" as any)
                            .select("id")
                            .eq("id", item.product_id)
                            .maybeSingle();

                        // Fetch real-time count from DB for each item
                        const { data: qData } = await supabase
                            .from("purchase_intention_items")
                            .select("download_count, max_downloads")
                            .eq("id", item.id)
                            .single();
                        
                        // Check if already reviewed
                        const { data: rData } = await supabase
                            .from("product_reviews" as any)
                            .select("id")
                            .eq("order_id", order.id)
                            .maybeSingle();
                        
                        return { 
                            ...item, 
                            order_id: order.id,
                            is_digital: !!product, 
                            download_count: qData?.download_count || 0,
                            max_downloads: qData?.max_downloads || 10,
                            is_reviewed: !!rData
                        };
                    }));

                    return { ...order, items: itemsWithLinks.filter((i: any) => i.is_digital) };
                }));

                // Filter out orders with no digital items
                setOrders(enrichedOrders.filter(o => o.items.length > 0));
            } catch (err) {
                console.error(err);
                toast.error("Erro ao carregar sua biblioteca.");
            } finally {
                setIsLoading(false);
            }
        };

    useEffect(() => {
        fetchDownloads();
    }, [navigate]);

    const handleDownload = (itemId: string) => {
        navigate(`/entrega/digital/${itemId}`);
    };

    const handleOpenReview = (item: any) => {
        setSelectedItemForReview(item);
        setReviewModalOpen(true);
    };

    return (
        <MarketLayout>
            <div className="bg-institutional-yellow min-h-screen py-12 px-4">
                <div className="container max-w-5xl mx-auto space-y-12">
                    
                    {/* PAGE HEADER */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-emerald-600">
                                <Zap className="w-5 h-5 fill-current" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Minha Área Viagg</span>
                            </div>
                            <h1 className="text-5xl font-black text-zinc-900 uppercase tracking-tighter leading-none">Minha Biblioteca<br />Digital</h1>
                            <p className="text-zinc-500 font-medium text-sm max-w-md uppercase tracking-widest leading-loose">
                                Acesse seus softwares, e-books e licenças adquiridas no marketplace.
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="relative group overflow-hidden rounded-[20px] bg-white border border-zinc-100 shadow-xl focus-within:ring-2 ring-emerald-500/20 transition-all">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300 pointer-events-none group-focus-within:text-emerald-500 transition-colors" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar na biblioteca..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-11 pr-6 py-4 bg-transparent outline-none text-sm font-bold text-zinc-700 placeholder:text-zinc-300 w-64"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-zinc-100" />

                    {/* CONTENT */}
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-4">
                            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sincronizando com a Nuvem...</p>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-32 space-y-8 animate-in fade-in zoom-in slide-in-from-bottom-8 duration-700">
                            <div className="w-40 h-40 bg-zinc-100 rounded-full mx-auto flex items-center justify-center shadow-inner relative group">
                                <PackageOpen className="w-16 h-16 text-zinc-300 group-hover:scale-110 transition-transform duration-500" />
                                <div className="absolute -top-2 -right-2 bg-white p-3 rounded-2xl shadow-xl animate-bounce">
                                    <ShoppingCart className="w-5 h-5 text-emerald-500" />
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">Sua biblioteca está vazia</h3>
                                <p className="text-zinc-500 text-sm font-medium uppercase tracking-[0.15em] max-w-sm mx-auto leading-relaxed">
                                    Você ainda não adquiriu nenhum produto digital. Explore nosso marketplace para encontrar softwares e conteúdos exclusivos.
                                </p>
                            </div>
                            <Button 
                                onClick={() => navigate("/mercado")}
                                className="h-16 bg-zinc-900 hover:bg-zinc-800 text-white px-10 rounded-[24px] font-black uppercase text-xs tracking-widest shadow-2xl transition-all hover:scale-[1.03]"
                            >
                                Explorar Marketplace
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {orders.flatMap(order => order.items).map((item, idx) => (
                                <Card 
                                    key={`${item.id}-${idx}`}
                                    className="group relative overflow-hidden border-none shadow-3xl rounded-[40px] bg-white ring-1 ring-zinc-50 hover:ring-emerald-500/30 transition-all duration-500 hover:-translate-y-2"
                                >
                                    <div className="p-8 space-y-6">
                                        {/* Image/Icon Header */}
                                        <div className="relative aspect-video rounded-3xl overflow-hidden bg-zinc-100 shadow-xl ring-1 ring-black/5">
                                            {item.product_image_url ? (
                                                <img 
                                                    src={item.product_image_url} 
                                                    alt={item.product_title} 
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-zinc-300">
                                                    <Zap className="w-12 h-12 fill-current" />
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4 flex flex-col gap-2">
                                                <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-lg">
                                                    <Zap className="w-4 h-4 fill-current" />
                                                </div>
                                                {item.is_reviewed && (
                                                    <div className="bg-amber-400 text-white p-2 rounded-xl shadow-lg animate-in zoom-in duration-500">
                                                        <Star className="w-4 h-4 fill-current" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="space-y-1">
                                            <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight line-clamp-2 leading-tight min-h-[48px]">
                                                {item.product_title}
                                            </h3>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-loose">
                                                    Cota: {item.download_count}/{item.max_downloads}
                                                </p>
                                                <span className={cn(
                                                    "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                    item.download_count < item.max_downloads ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                                                )}>
                                                    {item.download_count < item.max_downloads ? "Ativo" : "Esgotado"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="h-px bg-zinc-100" />

                                        {/* Actions */}
                                        <div className="space-y-2">
                                            <Button 
                                                onClick={() => handleDownload(item.id)}
                                                disabled={item.download_count >= item.max_downloads}
                                                className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:grayscale disabled:opacity-50"
                                            >
                                                <Download className="w-4 h-4" /> Baixar via Gateway
                                            </Button>
                                            {!item.is_reviewed ? (
                                                <Button 
                                                    variant="outline"
                                                    onClick={() => handleOpenReview(item)}
                                                    className="w-full h-12 text-amber-600 border-amber-100 hover:bg-amber-50 font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 rounded-[20px]"
                                                >
                                                    <Star className="w-3 h-3" /> Avaliar Produto
                                                </Button>
                                            ) : (
                                                <div className="w-full h-12 bg-zinc-50 text-zinc-400 font-black uppercase text-[8px] tracking-widest flex items-center justify-center gap-2 rounded-[20px] border border-zinc-100">
                                                    <CheckCircle2 className="w-3 h-3" /> Produto Avaliado
                                                </div>
                                            )}
                                            <Button 
                                                variant="ghost"
                                                onClick={() => navigate(`/produto/${item.product_id}`)}
                                                className="w-full h-10 text-zinc-400 hover:text-zinc-900 font-black uppercase text-[8px] tracking-widest flex items-center justify-center gap-2"
                                            >
                                                Ver Detalhes <ExternalLink className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Overlay Gradient on Hover */}
                                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* MODAL AREA */}
                    <ProductReviewModal 
                        isOpen={reviewModalOpen}
                        onClose={() => setReviewModalOpen(false)}
                        productId={selectedItemForReview?.product_id}
                        orderId={selectedItemForReview?.order_id}
                        productTitle={selectedItemForReview?.product_title}
                        onSuccess={() => fetchDownloads()}
                    />

                </div>
            </div>
        </MarketLayout>
    );
}
