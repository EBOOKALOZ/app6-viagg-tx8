import React from 'react';
import { Store, MapPin, ExternalLink, MessageCircle, Package, Sparkles, ShoppingBag, ArrowRight } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// CampaignPromoCard — Card premium de divulgação local
// Layout comercial branco/limpo para grupos de WhatsApp
// Para uso no painel Postador (motoboy) e preview do lojista
// ═══════════════════════════════════════════════════════════

export interface CampaignPromoCardProps {
    // Store info
    storeName: string;
    storeLogo?: string | null;
    storeCity?: string | null;
    storeBairro?: string | null;
    storeWhatsapp?: string | null;
    storeSiteUrl?: string | null;

    // Product info
    productName: string;
    productPrice?: number | null;
    productImage?: string | null;
    productDescription?: string | null;

    // Campaign info
    campaignTitle?: string | null;
    ctaLabel?: string | null;
    badge?: string;

    // Layout
    compact?: boolean;
}

export function CampaignPromoCard({
    storeName,
    storeLogo,
    storeCity,
    storeBairro,
    storeWhatsapp,
    storeSiteUrl,
    productName,
    productPrice,
    productImage,
    productDescription,
    campaignTitle,
    ctaLabel,
    badge = 'Oferta local',
    compact = false,
}: CampaignPromoCardProps) {
    const formatPrice = (price: number) =>
        `R$ ${price.toFixed(2).replace('.', ',')}`;

    const formatWhatsapp = (num: string) => {
        const clean = num.replace(/\D/g, '');
        if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
        if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
        return num;
    };

    const location = [storeBairro, storeCity].filter(Boolean).join(', ');

    return (
        <div className="w-full max-w-sm mx-auto">
            <div
                className="rounded-3xl overflow-hidden border border-orange-200/80 shadow-xl shadow-orange-900/5"
                style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", backgroundColor: '#FFF5EB' }}
            >

                {/* ─── 1. HEADER: Logo + Store name + Badge ────────── */}
                <div className="px-5 pt-5 pb-3 flex items-center gap-3">
                    {/* Store logo */}
                    <div className="shrink-0">
                        {storeLogo ? (
                            <img
                                src={storeLogo}
                                alt={storeName}
                                className="w-11 h-11 rounded-xl object-cover border border-gray-200 shadow-sm"
                            />
                        ) : (
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 flex items-center justify-center shadow-sm">
                                <Store className="h-5 w-5 text-orange-400" />
                            </div>
                        )}
                    </div>

                    {/* Store name + location */}
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate leading-tight">{storeName}</p>
                        {location ? (
                            <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 shrink-0 text-gray-300" />
                                {location}
                            </p>
                        ) : (
                            <p className="text-[11px] text-orange-400/80 font-medium mt-0.5">Divulgação local</p>
                        )}
                    </div>

                    {/* Badge */}
                    <div className="shrink-0">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-100 text-[10px] font-bold text-orange-600 uppercase tracking-wider">
                            <Sparkles className="h-3 w-3" />
                            {badge}
                        </span>
                    </div>
                </div>

                {/* ─── 2. IMAGEM PRINCIPAL DO PRODUTO ───────────────── */}
                <div className="mx-4 rounded-2xl overflow-hidden border border-gray-100">
                    {productImage ? (
                        <div className={compact ? "aspect-[4/3]" : "aspect-[4/3]"}>
                            <img
                                src={productImage}
                                alt={productName}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    ) : (
                        <div className={`${compact ? "aspect-[4/3]" : "aspect-[4/3]"} bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center gap-2`}>
                            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                <Package className="h-8 w-8 text-gray-300" />
                            </div>
                            <p className="text-[11px] text-gray-300 font-medium">Imagem do produto</p>
                        </div>
                    )}
                </div>

                {/* ─── 3. INFORMAÇÕES DO PRODUTO ─────────────────────── */}
                <div className="px-5 pt-4 pb-1">
                    {/* Product name */}
                    <h3 className="text-gray-900 font-extrabold text-[17px] leading-snug line-clamp-2">
                        {productName}
                    </h3>

                    {/* Description */}
                    {productDescription && (
                        <p className="text-gray-500 text-[13px] mt-1.5 leading-relaxed line-clamp-3">
                            {productDescription}
                        </p>
                    )}

                    {/* Price */}
                    {productPrice != null && productPrice > 0 && (
                        <div className="mt-3">
                            <span className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-extrabold text-base tracking-tight">
                                {formatPrice(productPrice)}
                            </span>
                        </div>
                    )}
                </div>

                {/* ─── 4. CONTATO / DESTINO ─────────────────────────── */}
                {(storeWhatsapp || storeSiteUrl) && (
                    <div className="px-5 pt-3 space-y-2">
                        {/* WhatsApp */}
                        {storeWhatsapp && (
                            <a
                                href={`https://wa.me/55${storeWhatsapp.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100/80 hover:bg-emerald-50 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                                    <MessageCircle className="h-4 w-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-emerald-600 text-[10px] font-bold uppercase tracking-wider">WhatsApp da loja</p>
                                    <p className="text-gray-800 text-xs font-semibold">{formatWhatsapp(storeWhatsapp)}</p>
                                </div>
                            </a>
                        )}

                        {/* Site */}
                        {storeSiteUrl && (
                            <a
                                href={storeSiteUrl.startsWith('http') ? storeSiteUrl : `https://${storeSiteUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-blue-50/70 border border-blue-100/80 hover:bg-blue-50 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0 shadow-sm">
                                    <ExternalLink className="h-4 w-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-blue-600 text-[10px] font-bold uppercase tracking-wider">Site da loja</p>
                                    <p className="text-gray-800 text-xs font-semibold truncate">{storeSiteUrl.replace(/^https?:\/\//, '')}</p>
                                </div>
                            </a>
                        )}
                    </div>
                )}

                {/* ─── 5. CTA FINAL ─────────────────────────────────── */}
                <div className="px-5 pt-4 pb-3">
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-md shadow-orange-500/20 active:scale-[0.98]">
                        <ShoppingBag className="h-4 w-4 text-white" />
                        <span className="text-white font-bold text-sm">
                            {ctaLabel || 'Acesse a oferta local'}
                        </span>
                        <ArrowRight className="h-4 w-4 text-white/70" />
                    </button>
                </div>

                {/* ─── 6. RODAPÉ DISCRETO ───────────────────────────── */}
                <div className="px-5 pb-4 pt-0.5">
                    <p className="text-center text-[10px] text-gray-300 font-medium tracking-wide">
                        Oferta da sua região • Divulgação local
                    </p>
                </div>

                {/* Bottom accent gradient */}
                <div className="h-1 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />
            </div>
        </div>
    );
}

export default CampaignPromoCard;
