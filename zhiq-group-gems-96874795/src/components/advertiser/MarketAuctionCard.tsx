import React from 'react';
import {
  Gavel,
  Tag,
  Timer,
  Flame,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PremiumCard, PremiumBadge, PremiumFeature } from '@/components/ui/PremiumCard';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { supabase } from '@/integrations/supabase/client';
import type { AuctionListing } from '@/hooks/useAuctions';
import { cn } from '@/lib/utils';

interface MarketAuctionCardProps {
  listing: AuctionListing;
}

export const MarketAuctionCard: React.FC<MarketAuctionCardProps> = ({ listing }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = React.useState(false);

  const isAuction = listing.listing_type === 'auction';

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
    navigate(`/mercado/leiloes/${listing.id}`);
  };

  const formatTimeLeft = () => {
    if (isEnded) return { text: 'Encerrado', className: 'bg-gray-500/90 text-white' };

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    const isUrgent = diff < 3600000; // < 1 hora
    const className = isUrgent
      ? 'bg-red-500/90 text-white animate-pulse'
      : 'bg-emerald-600/90 text-white';

    let text = '';
    if (days > 0) {
      text = `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      text = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return { text, className };
  };

  const timeLeft = formatTimeLeft();

  const features: PremiumFeature[] = [
    { icon: <Gavel className="w-full h-full" />, label: `${listing.total_bids || 0} lances` }
  ];

  const badges: PremiumBadge[] = [
    { label: 'Verificado', variant: 'verified' }
  ];
  
  if (isAuction) {
    badges.push({ label: 'Leilão', variant: 'featured', overrideClasses: 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] text-white font-black uppercase tracking-widest text-[10px] shadow-lg border-0' });
  } else {
    badges.push({ label: 'Arremate', variant: 'featured', overrideClasses: 'bg-gradient-to-r from-blue-500 to-purple-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg border-0' });
  }

  const timerOverlay = !isEnded && (
    <div className="absolute bottom-3 right-3 z-20 pointer-events-none">
      <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black backdrop-blur-md shadow-lg", timeLeft.className)}>
        <Timer className="w-3.5 h-3.5" />
        {isEndingSoon && <Flame className="w-3.5 h-3.5 animate-pulse" />}
        <span className="font-mono tracking-wider">{timeLeft.text}</span>
      </div>
    </div>
  );

  let location = '';
  if (listing.city) {
    location += listing.city;
    if (listing.neighborhood) location += `, ${listing.neighborhood}`;
  }

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <PremiumCard
          imageUrl={listing.product_image_url}
          fallbackIcon={<Gavel className="w-16 h-16 text-[#FF6A00]/20" />}
          category={isAuction ? 'Leilão' : 'Arremate'}
          categoryColor={isAuction ? 'bg-[#FF6A00]' : 'bg-blue-500'}
          title={listing.title}
          description={listing.description}
          location={location || undefined}
          price={currentPrice}
          oldPrice={buyNowPrice && buyNowPrice > currentPrice ? buyNowPrice : undefined}
          features={features}
          badges={badges}
          isFavorited={favorited}
          onFavorite={() => setFavorited(v => !v)}
          onClick={handleClick}
          primaryActionLabel={isEnded ? 'Encerrado' : isAuction ? 'Dar Lance Agora' : 'Fazer Oferta'}
          primaryActionIcon={!isEnded && isAuction ? <Zap className="w-4 h-4 mr-1" /> : !isEnded ? <Tag className="w-4 h-4 mr-1" /> : undefined}
          primaryActionClass={isEnded ? 'bg-gray-400' : isAuction ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white border-0" : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"}
          customOverlays={timerOverlay}
          aspectRatio="video"
        />
      </div>
    </div>
  );
};

export default MarketAuctionCard;
