import React from 'react';
import {
  Gavel,
  Tag,
  Timer,
  Flame,
  Zap,
  MapPin,
  Share2,
  Heart,
  Store,
  Check,
  Truck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { supabase } from '@/integrations/supabase/client';
import type { AuctionListing } from '@/hooks/useAuctions';
import { CardDark, CardImageOverlay, DarkBadge } from '@/components/ui/dark-card';
import { cn, formatCurrencyBRL } from '@/lib/utils';

interface MarketAuctionCardProps {
  listing: AuctionListing;
  /**
   * 'grid' (padrão): card ocupa o slot ou grade.
   * 'carousel': ocupa 100% do contêiner para faixas horizontais.
   */
  variant?: 'grid' | 'carousel';
  /**
   * Destino do clique no card:
   *  - 'store' (padrão): abre a LOJA PÚBLICA do vendedor com a aba correta
   *  - 'detail': vai direto ao detalhe do leilão/arremate (dar lance/fazer oferta).
   */
  linkTo?: 'store' | 'detail';
}

export const MarketAuctionCard: React.FC<MarketAuctionCardProps> = ({ listing, variant = 'grid', linkTo = 'store' }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = React.useState(false);

  // Buscar informações da loja / anunciante se existir store_id
  const { data: storeInfo } = useQuery({
    queryKey: ['auction-store-info', listing.store_id],
    queryFn: async () => {
      if (!listing.store_id) return null;
      const { data } = await supabase
        .from('merchant_stores')
        .select('id, store_name, logo_url, cidade, bairro, city, neighborhood')
        .eq('id', listing.store_id)
        .maybeSingle();
      return data;
    },
    enabled: !!listing.store_id,
    staleTime: 5 * 60 * 1000,
  });

  const storeLogo = storeInfo?.logo_url || "/viagg-logo.png";
  const storeName = storeInfo?.store_name || "Oficial Viagg-TX8";

  // Identificar condição do item (Novo / Usado)
  const rawCond = (listing as any).condition || (listing.title?.toLowerCase().includes('usado') || listing.description?.toLowerCase().includes('usado') ? 'used' : listing.title?.toLowerCase().includes('seminovo') ? 'seminovo' : 'new');
  const condLabel = rawCond === 'used' || rawCond === 'usado' ? 'Usado' : rawCond === 'seminovo' ? 'Seminovo' : rawCond === 'recondicionado' ? 'Recondicionado' : 'Novo';
  const condColor = rawCond === 'used' || rawCond === 'usado' ? 'bg-amber-500/90 border-amber-400/30 text-white' : rawCond === 'seminovo' ? 'bg-sky-500/90 border-sky-400/30 text-white' : rawCond === 'recondicionado' ? 'bg-[#8B5E3C]/90 border-[#8B5E3C]/30 text-white' : 'bg-emerald-500/90 border-emerald-400/30 text-white';

  const isAuction = listing.listing_type === 'auction';

  // Tipo de entrega: pickup (retirada) | delivery | both
  const fulfillment = listing.fulfillment_type || 'pickup';
  const isFreeDelivery = fulfillment === 'delivery' || fulfillment === 'both';

  // Calcular tempo restante
  const endsAt = new Date(listing.ends_at);
  const now = new Date();
  const diff = endsAt.getTime() - now.getTime();
  const isEndingSoon = diff > 0 && diff < 3600000; // menos de 1 hora
  const isEnded = diff <= 0;

  const currentPrice = listing.current_bid || listing.starting_bid || 0;
  const buyNowPrice = listing.buy_now_price || null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      Promise.resolve(
        supabase.rpc('rpc_register_property_click', {
          p_listing_id: listing.id,
          p_visitor_fingerprint: getVisitorFingerprint(),
          p_amount: 3
        })
      ).catch(console.error);
    } catch (err) {
      console.error('[CPC_ERROR]', err);
    }
    if (linkTo === 'store' && listing.store_id) {
      // Novo fluxo: abre a página do anunciante na aba certa COM o leilão em destaque.
      navigate(`/loja/${listing.store_id}?tab=${isAuction ? 'leiloes' : 'arremates'}&product=${listing.id}`);
    } else {
      navigate(`/mercado/leiloes/${listing.id}`);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorited(v => !v);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/mercado/leiloes/${listing.id}`;
    if (navigator.share) {
      navigator.share({ title: listing.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  const formatTimeLeft = () => {
    if (isEnded) return { text: 'Encerrado', className: 'bg-gray-600/90 text-white border-gray-500' };

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    const isUrgent = diff < 3600000; // < 1 hora
    const className = isUrgent
      ? 'bg-red-500/95 text-white animate-pulse border-red-400'
      : 'bg-[#1A1F24]/90 text-[#00C58E] border-[#323A45]';

    let text = '';
    if (days > 0) {
      text = `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      text = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return { text, className };
  };

  const timeLeft = formatTimeLeft();

  // Endereço onde o produto está: usa o do anúncio; se vazio, cai para o da loja
  const locCity = listing.city || (storeInfo as any)?.cidade || (storeInfo as any)?.city || '';
  const locNeighborhood = listing.neighborhood || (storeInfo as any)?.bairro || (storeInfo as any)?.neighborhood || '';
  let location = '';
  if (locCity) {
    location += locCity;
    if (locNeighborhood) location += `, ${locNeighborhood}`;
  } else if (locNeighborhood) {
    location = locNeighborhood;
  }

  const formattedPrice = formatCurrencyBRL(currentPrice).replace(/^R\$\s*/, '');

  const card = (
    <CardDark
      onClick={handleClick}
      className="group relative flex flex-col w-full h-full cursor-pointer transition-all duration-300 ease-out hover:border-[#3E4854] hover:shadow-[0_16px_40px_rgba(0,0,0,0.5)] lg:hover:-translate-y-0.5"
    >
      {/* ─── 1. IMAGEM PRINCIPAL (~55% do card) ─── */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[1.15] overflow-hidden bg-[#252B33] shrink-0">
        {listing.product_image_url ? (
          <img
            src={listing.product_image_url}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#8E98A3]">
            <Gavel className="w-16 h-16 text-[#FF6A00]/20" />
          </div>
        )}

        {/* Logo oficial Viagg-TX8 no topo superior esquerdo */}
        <img
          src="/viagg-logo.png"
          alt="Viagg-TX8"
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          className="absolute top-2.5 left-2.5 z-20 h-11 w-11 rounded-lg object-cover shadow-md ring-1 ring-white/20 pointer-events-none"
        />

        {/* Badge de Categoria/Tipo no topo (ao lado do logo) + Condição (Novo / Usado) */}
        <div className="absolute top-2.5 left-16 z-20 flex items-center gap-1.5 pointer-events-none">
          {isAuction ? (
            <DarkBadge tone="orange" className="shadow-md backdrop-blur-md bg-[#FF6A00] text-white font-black">
              LEILÃO
            </DarkBadge>
          ) : (
            <DarkBadge tone="orange" className="shadow-md backdrop-blur-md bg-gradient-to-r from-blue-500 to-purple-500 text-white font-black">
              ARREMATE
            </DarkBadge>
          )}
          <DarkBadge tone="green" className={cn("shadow-md backdrop-blur-md font-black uppercase text-[10px] tracking-wide", condColor)}>
            {condLabel}
          </DarkBadge>
        </div>

        {/* Botões Compartilhar e Favoritar no topo direito */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
          <button
            onClick={handleShareClick}
            className="p-2 rounded-full bg-[#1A1F24]/80 hover:bg-[#1A1F24] border border-[#323A45] shadow-sm backdrop-blur-md text-white/90 hover:text-white transition-all duration-200 hover:scale-105"
            title="Compartilhar"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleFavoriteClick}
            className="p-2 rounded-full bg-[#1A1F24]/80 hover:bg-[#1A1F24] border border-[#323A45] shadow-sm backdrop-blur-md transition-all duration-200 hover:scale-105"
            title="Favoritar"
          >
            <Heart
              className={cn("w-4 h-4 transition-all duration-300", favorited ? "fill-red-500 text-red-500 scale-110" : "text-white/90 hover:text-white")}
            />
          </button>
        </div>

        {/* Watermark central VX — reforço de marca */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[5]"
        >
          <span className="font-black tracking-tighter text-white/[0.07] mix-blend-overlay text-6xl sm:text-7xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
            VX
          </span>
        </div>

        {/* Selo institucional no canto inferior esquerdo */}
        <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
          <div className="flex items-center gap-1 rounded-full bg-[#1A1F24]/85 backdrop-blur-md px-2.5 py-1 shadow-md ring-1 ring-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C58E] shrink-0" aria-hidden="true" />
            <span className="text-[9px] font-black uppercase tracking-wider text-white/95">Oficial Viagg-TX8</span>
          </div>
        </div>

        {/* Contador / Timer no canto inferior direito */}
        <div className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none">
          <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black backdrop-blur-md shadow-lg border", timeLeft.className)}>
            <Timer className="w-3.5 h-3.5 shrink-0" />
            {isEndingSoon && <Flame className="w-3.5 h-3.5 animate-pulse text-amber-300 shrink-0" />}
            <span className="font-mono tracking-wider">{timeLeft.text}</span>
          </div>
        </div>

        {/* Gradiente de leitura suave sobre a foto */}
        <CardImageOverlay className="z-10" />
      </div>

      {/* ─── CORPO DO CARD ─── */}
      <div className="flex flex-col flex-1 p-5 sm:p-6 space-y-3">
        {/* 2. Nome do Item */}
        <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 group-hover:text-[#FF7A00] transition-colors">
          {listing.title}
        </h3>

        {/* 3. Valor em destaque */}
        <div className="pt-0.5 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8E98A3] block mb-0.5">
              {isAuction ? 'Lance Atual' : 'Preço de Arremate'}
            </span>
            <p className={cn("text-2xl font-black tracking-tight flex items-baseline", isAuction ? "text-[#FF6A00]" : "text-blue-400")}>
              <span className="text-sm font-normal mr-1">R$</span>
              <span>{formattedPrice}</span>
            </p>
            {isAuction && (
              <p className="text-xs text-[#8E98A3] mt-1 font-semibold flex items-center gap-1.5">
                <span>Lance mínimo:</span>
                <span className="font-black text-[#00C58E] animate-blink-1hz inline-block">
                  {formatCurrencyBRL(currentPrice + (listing.minimum_increment || 1))}
                </span>
              </p>
            )}
          </div>
          {buyNowPrice && buyNowPrice > currentPrice && (
            <div className="text-xs text-[#8E98A3]">
              <span className="block text-[10px]">Preço Original:</span>
              <span className="line-through font-semibold text-gray-400">{formatCurrencyBRL(buyNowPrice)}</span>
            </div>
          )}
        </div>

        {/* 4. Informações Rápidas */}
        <div className="flex items-center flex-wrap gap-2 pt-1.5 text-xs font-semibold text-[#B8C2CC]">
          {location && (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl max-w-full truncate" title={location}>
              <MapPin className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span className="truncate">{location}</span>
            </div>
          )}
          {isAuction && (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl shrink-0">
              <Gavel className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
              <span>{listing.total_bids || 0} {(listing.total_bids || 0) === 1 ? 'lance' : 'lances'}</span>
            </div>
          )}
          {isFreeDelivery ? (
            <div className="flex items-center gap-1.5 bg-[#00C58E]/10 border border-[#00C58E]/40 px-2.5 py-1 rounded-xl shrink-0">
              <Truck className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span className="text-[#00C58E] font-black">Entrega grátis</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl shrink-0">
              <Store className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />
              <span>A retirar</span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ─── 5. RODAPÉ & BOTÃO PRINCIPAL ─── */}
        <div className="pt-3 border-t border-[#323A45] mt-auto space-y-3">
          <div className="flex flex-col gap-2.5 pt-1">
            {/* Linha 1: Info do Anunciante com Logo (100% da largura para o nome ficar em uma única linha e Viagg-TX8 junto) */}
            <div className="flex items-center gap-2.5 w-full">
              <div className="w-7 h-7 rounded-full overflow-hidden border border-[#323A45] bg-[#252B33] shrink-0 flex items-center justify-center shadow-sm">
                <img
                  src={storeLogo}
                  alt={storeName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/viagg-logo.png";
                  }}
                />
              </div>
              <div className="min-w-0 flex flex-col flex-1">
                <span className="text-[10px] font-black text-[#8E98A3] uppercase tracking-wider">Anunciante</span>
                <span
                  className="text-xs sm:text-sm font-bold text-[#E2E8F0] whitespace-normal leading-tight"
                  style={{ wordBreak: 'normal' }}
                  title={storeName}
                >
                  {storeName.replace(/Viagg-TX8/gi, 'Viagg\u2011TX8')}
                </span>
              </div>
            </div>

            {/* Linha 2: Selos Verificado & Oficial juntos em destaque */}
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <DarkBadge
                tone="green"
                className="shadow-md backdrop-blur-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black px-2.5 py-1 w-fit"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 stroke-[3]" />
                <span>Verificado</span>
              </DarkBadge>
              <DarkBadge tone="green" className="text-[10px] sm:text-[11px] font-black px-2.5 py-1 shadow-sm">
                Oficial
              </DarkBadge>
            </div>
          </div>

          <button
            onClick={handleClick}
            className={cn(
              "w-full h-11 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all duration-200 active:scale-[0.98]",
              isEnded
                ? "bg-gray-600 hover:bg-gray-500 cursor-not-allowed"
                : isAuction
                ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] shadow-[#FF6A00]/20"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-blue-500/20"
            )}
          >
            {!isEnded && (isAuction ? <Zap className="w-4 h-4 shrink-0" /> : <Tag className="w-4 h-4 shrink-0" />)}
            <span>{isEnded ? 'Encerrado' : isAuction ? 'Dar Lance Agora' : 'Fazer Oferta'}</span>
          </button>
        </div>
      </div>
    </CardDark>
  );

  if (variant === 'carousel') {
    return <div className="w-full h-full">{card}</div>;
  }
  return <div className="w-full">{card}</div>;
};

export default MarketAuctionCard;
