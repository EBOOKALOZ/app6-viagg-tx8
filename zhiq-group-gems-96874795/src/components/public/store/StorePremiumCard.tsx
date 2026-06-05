import { formatCurrencyBRL } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Truck, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StoreProduct {
    id: string;
    title: string;
    short_description: string | null;
    image_url: string | null;
    price: number;
    original_price: number | null;
    price_label: string | null;
    cta_label: string | null;
    tracking_slug: string | null;
    category: string | null;
    condition: string | null;
    is_active: boolean;
    is_digital: boolean;
    is_featured: boolean;
    created_at: string;
}

interface StorePremiumCardProps {
    product: StoreProduct;
    isRecentlyAdded: boolean;
    onAddToCart: (product: StoreProduct) => void;
    onClick: (product: StoreProduct) => void;
    onAskQuestion?: (product: StoreProduct) => void;
    onMakeOffer?: (product: StoreProduct) => void;
}

function normalizeImageUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return trimmed;
}

export function StorePremiumCard({ product, isRecentlyAdded, onAddToCart, onClick, onAskQuestion, onMakeOffer }: StorePremiumCardProps) {
    const imgSrc = normalizeImageUrl(product.image_url);
    const hasDiscount = (product.original_price || 0) > product.price;
    const discountPct = hasDiscount && product.original_price 
        ? Math.round(((product.original_price - product.price) / product.original_price) * 100) 
        : 0;
            
    // Mocked social proof / metrics (as per visual premium guideline)
    const soldCount = Math.floor(Math.random() * 50) + 1;
    const rating = (Math.random() * 1 + 4.0).toFixed(1);

    return (
        <div 
            onClick={() => onClick(product)}
            className={cn(
                "group bg-white rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col shadow-sm hover:shadow-2xl border border-zinc-100 hover:border-[#FF6A00]/20",
                product.is_featured && "ring-2 ring-[#FF6A00]/20 shadow-[#FF6A00]/5"
            )}
        >
            {/* Image Container */}
            <div className="relative aspect-square overflow-hidden bg-zinc-50 transition-transform duration-700">
                {imgSrc ? (
                    <img 
                        src={imgSrc} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        alt={product.title}
                        onError={async (e) => {
                            const el = e.currentTarget;
                            if (el.dataset.retried) { el.style.display = "none"; return; }
                            el.dataset.retried = "1";
                            try {
                                const res = await fetch(imgSrc);
                                if (!res.ok) { el.style.display = "none"; return; }
                                const blob = await res.blob();
                                const fixedBlob = blob.type.startsWith('image/')
                                    ? blob
                                    : new Blob([blob], { type: 'image/jpeg' });
                                el.src = URL.createObjectURL(fixedBlob);
                            } catch { el.style.display = "none"; }
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-200 bg-zinc-100/50">
                        <ShoppingBag className="w-12 h-12" />
                    </div>
                )}

                {/* Top Left Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1.5 pointer-events-none">
                    {product.condition === 'new' && (
                        <Badge className="bg-emerald-500 text-white text-[8px] font-black uppercase px-2 h-5 rounded-md border-none ring-1 ring-white/20 shadow-sm">
                            Novo
                        </Badge>
                    )}
                    {product.is_digital && (
                        <Badge className="bg-zinc-900/90 text-white text-[8px] font-black uppercase px-2 h-5 rounded-md border-none ring-1 ring-white/20 shadow-sm">
                            Digital
                        </Badge>
                    )}
                </div>

                {/* Discount Tag */}
                {hasDiscount && (
                    <div className="absolute top-0 right-0 bg-[#FF6A00] text-white font-black text-[11px] px-2.5 py-1 rounded-bl-xl shadow-lg border-l border-b border-white/20">
                        -{discountPct}%
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="p-3 flex flex-col flex-1 gap-2">
                <h3 className="text-zinc-800 text-xs sm:text-sm font-medium line-clamp-2 leading-tight min-h-[2.5em] group-hover:text-[#FF6A00] transition-colors">
                    {product.title}
                </h3>

                <div className="mt-auto space-y-1">
                    {hasDiscount ? (
                        <div className="space-y-0.5">
                        <p className="text-[10px] text-zinc-400 line-through">R$ {product.original_price?.toFixed(2)}</p>
                        <div className="flex items-center gap-1.5">
                            <span className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight leading-none italic">
                                {formatCurrencyBRL(product.price)}
                            </span>
                            <Badge className="bg-emerald-50 text-emerald-600 border-none text-[9px] h-4 font-black px-1.5">
                                OFF
                            </Badge>
                        </div>
                        </div>
                    ) : (
                        <span className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight leading-none italic block mt-2">
                            {formatCurrencyBRL(product.price)}
                        </span>
                    )}
                </div>
                
                {/* Social Proof & Trust */}
                <div className="flex items-center justify-between text-[10px] font-bold mt-1">
                    <span className="text-amber-500 flex items-center gap-0.5">
                        ⭐ {rating}
                    </span>
                    <span className="text-zinc-400">
                        {soldCount} vendidos
                    </span>
                </div>

                <div className="flex items-center gap-1 text-[9px] text-emerald-600 font-bold bg-emerald-50 w-fit px-1.5 py-0.5 rounded">
                    <Truck className="w-3 h-3" /> Envio rápido
                </div>

                {/* Desktop Button - usually visible on hover on desktops, but let's keep it visible for UX */}
                <div className="flex flex-col gap-1.5 mt-2">
                    <Button 
                        className={cn(
                            "w-full h-9 sm:h-10 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
                            isRecentlyAdded 
                                ? "bg-emerald-500 text-white hover:bg-emerald-600" 
                                : "bg-[#FF6A00] hover:bg-[#E65C00] text-white"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            const isImovel = product.cta_label === "Ver Imóvel" || product.cta_label === "Conhecer" || product.category?.toLowerCase().includes("imóvei") || product.category?.toLowerCase().includes("imovei");
                            if (isImovel) {
                                onClick(product);
                            } else {
                                onAddToCart(product);
                            }
                        }}
                    >
                        {isRecentlyAdded ? "Adicionado!" : (
                            product.cta_label === "Ver Imóvel" ? "Conhecer" : 
                            (product.category?.toLowerCase().includes("imóvei") || product.category?.toLowerCase().includes("imovei")) ? "Conhecer" :
                            (product.cta_label || "Comprar")
                        )}
                    </Button>
                    
                    {onMakeOffer && (
                        <Button
                            variant="default"
                            className="w-full h-9 sm:h-10 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all bg-[#2563EB] text-white hover:bg-[#1D4ED8] border-none shadow-sm flex items-center justify-center gap-1.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                onMakeOffer(product);
                            }}
                        >
                            <Percent className="w-3.5 h-3.5" />
                            Minha Oferta é...
                        </Button>
                    )}

                    {onAskQuestion && (
                        <Button
                            variant="default"
                            className="w-full h-9 sm:h-10 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all bg-green-500 text-white hover:bg-green-600 border-none shadow-sm flex items-center justify-center gap-1.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAskQuestion(product);
                            }}
                        >
                            Perguntar sobre o Produto
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default StorePremiumCard;
