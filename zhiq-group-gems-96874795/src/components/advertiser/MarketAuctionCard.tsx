import React from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Gavel,
  Tag,
  MapPin,
  Timer,
  Users,
  ChevronRight,
  Flame,
  Eye,
  Zap,
  ShieldCheck,
  Heart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import type { AuctionListing } from '@/hooks/useAuctions';

interface MarketAuctionCardProps {
  listing: AuctionListing;
}

export const MarketAuctionCard: React.FC<MarketAuctionCardProps> = ({ listing }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = React.useState(false);

  const isAuction = listing.listing_type === 'auction';
  const isArremate = listing.listing_type === 'arremate';

  // Calcular tempo restante
  const endsAt = new Date(listing.ends_at);
  const now = new Date();
  const diff = endsAt.getTime() - now.getTime();
  const isEndingSoon = diff > 0 && diff < 3600000; // menos de 1 hora
  const isEnded = diff <= 0;

  // Formatar preço
  const currentPrice = listing.current_bid || listing.starting_bid || 0;
  const buyNowPrice = listing.buy_now_price || null;

  // Badge de tipo
  const getTypeBadge = () => {
    if (isAuction) {
      return (
        <Badge className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] text-white font-black uppercase tracking-widest text-[10px] shadow-lg">
          <Gavel className="w-3 h-3 mr-1" />
          Leilão
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg">
          <Tag className="w-3 h-3 mr-1" />
          Arremate
        </Badge>
      );
    }
  };

  // Formatar tempo restante
  const formatTimeLeft = () => {
    if (isEnded) return { text: 'Encerrado', className: 'bg-gray-500/90 text-white' };

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    const isUrgent = diff < 3600000; // < 1 hora
    const className = isUrgent
      ? 'bg-red-500/90 text-white animate-pulse'
      : 'bg-black/60 text-white';

    let text = '';
    if (days > 0) {
      text = `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      text = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return { text, className };
  };

  const timeLeft = formatTimeLeft();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dispara CPC tracking
    try {
      // supabase.rpc retorna um thenable — usar then/catch via Promise.resolve
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

    // Navega para página de detalhe no estilo marketplace
    navigate(`/mercado/leiloes/${listing.id}`);
  };

  return (
    <div className="flex justify-center w-full">
      <Card className="group overflow-hidden border-none shadow-xl rounded-3xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 bg-white ring-1 ring-zinc-100 hover:ring-[#FF6A00]/40">
        {/* 🖼️ IMAGE AREA 🖼️ */}
        <div className="relative aspect-[16/9] overflow-hidden bg-[#F5F7FA]">
          {listing.product_image_url ? (
            <img
              src={listing.product_image_url}
              alt={listing.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Gavel className="w-16 h-16 text-[#FF6A00]/20" />
            </div>
          )}

          {/* Overlays superiores */}
          <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between">
            {/* Badge de tipo */}
            {getTypeBadge()}

            {/* Ações direitas */}
            <div className="flex flex-col gap-2">
              {/* Botão favoritar */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFavorited(v => !v); }}
                className="bg-white/95 backdrop-blur-md rounded-full p-2 shadow-md hover:shadow-lg hover:scale-110 transition-all"
                aria-label="Salvar"
              >
                <Heart className={cn("w-4 h-4 transition-colors", favorited ? "fill-rose-500 text-rose-500" : "text-zinc-600")} />
              </button>

              {/* Badge de visualizações/confiança */}
              <div className="bg-[#FF6A00]/90 backdrop-blur-md text-white rounded-full p-2 shadow-lg scale-90 group-hover:scale-100 transition-transform flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Timer no canto inferior direito */}
          {!isEnded && (
            <div className="absolute bottom-3 right-3">
              <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black backdrop-blur-md shadow-lg", timeLeft.className)}>
                <Timer className="w-3.5 h-3.5" />
                {isEndingSoon && <Flame className="w-3.5 h-3.5 animate-pulse" />}
                <span className="font-mono tracking-wider">{timeLeft.text}</span>
              </div>
            </div>
          )}
        </div>

        {/* 📃 CONTEÚDO DO CARD 📃 */}
        <CardContent className="p-5 space-y-4">
          {/* Título */}
          <h3 className="font-black text-zinc-900 text-base leading-tight group-hover:text-[#FF6A00] transition-colors line-clamp-2 min-h-[44px]">
            {listing.title}
          </h3>

          {/* Preço principal */}
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-[#FF6A00] tracking-tighter">
              {formatCurrencyBRL(currentPrice)}
            </p>
            {buyNowPrice && buyNowPrice > currentPrice && (
              <p className="text-sm text-zinc-400 line-through">
                {formatCurrencyBRL(buyNowPrice)}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-zinc-500 font-bold">
            <span className="flex items-center gap-1.5">
              <Gavel className="w-3.5 h-3.5 text-[#FF6A00]" />
              {listing.total_bids || 0} lances
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              {listing.views_count || 0}
            </span>
            {listing.watchers_count > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {listing.watchers_count}
              </span>
            )}
          </div>

          {/* Localização */}
          {listing.city && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-50">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px] font-bold text-zinc-600">
                {listing.city}{listing.neighborhood ? `, ${listing.neighborhood}` : ''}
              </span>
            </div>
          )}
        </CardContent>

        {/* CTA Footer */}
        <CardFooter className="px-5 pb-6 pt-0">
          <Button
            onClick={handleClick}
            className={cn(
              "w-full rounded-2xl font-black text-sm h-12 shadow-lg transition-all active:scale-95 group/btn",
              isAuction
                ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white"
                : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
            )}
          >
            {isEnded ? (
              'Encerrado'
            ) : isAuction ? (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Dar Lance Agora
              </>
            ) : (
              <>
                <Tag className="w-4 h-4 mr-2" />
                Fazer Oferta
              </>
            )}
            <ChevronRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default MarketAuctionCard;
