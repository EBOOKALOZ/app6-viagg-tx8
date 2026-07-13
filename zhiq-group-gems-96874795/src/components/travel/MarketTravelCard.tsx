import React, { useState } from 'react';
import { Calendar, Plane } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PremiumCard, PremiumBadge, PremiumFeature } from '@/components/ui/PremiumCard';
import { resolveTravelCategoryEmoji } from '@/lib/viagem/travelCategories';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';

interface MarketTravelCardProps {
  travel: {
    id: string;
    title: string;
    category: string;
    price_per_person?: number | null;
    total_price?: number | null;
    entry_price?: string | null;
    destination?: string | null;
    city?: string | null;
    state?: string | null;
    departure_date?: string | null;
    duration_days?: number | null;
    thumbnail_url?: string | null;
    is_featured?: boolean;
    is_promoted?: boolean;
  };
}

export const MarketTravelCard: React.FC<MarketTravelCardProps> = ({ travel }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const emoji = resolveTravelCategoryEmoji(travel.category);

  const handleNavigate = () => {
    navigate(`/viagens/${travel.id}`);
  };

  const handleInterest = (e: React.MouseEvent) => {
    e.stopPropagation();
    setContactOpen(true);
  };

  const features: PremiumFeature[] = [];
  if (travel.duration_days) {
    features.push({
      icon: <Calendar className="w-full h-full" />,
      label: `${travel.duration_days}d`
    });
  }
  if (travel.departure_date) {
    features.push({
      icon: <Calendar className="w-full h-full" />,
      label: `Saída: ${new Date(travel.departure_date + 'T12:00:00').toLocaleDateString('pt-BR')}`
    });
  }

  const badges: PremiumBadge[] = [
    { label: 'Verificado', variant: 'verified' }
  ];
  if (travel.is_featured) {
    badges.push({ label: 'Destaque', variant: 'featured' });
  }
  if (travel.is_promoted) {
    badges.push({ label: 'Promovido', variant: 'sponsored' });
  }

  const priceValue = travel.price_per_person || travel.total_price || null;
  const pricePrefix = travel.entry_price?.trim() || 'R$';
  const priceSuffix = travel.price_per_person ? '/ pessoa' : '';

  let location = '';
  if (travel.destination) location += travel.destination;
  if (travel.city) location += (location ? ' · ' : '') + travel.city;
  if (travel.state) location += (location ? ', ' : '') + travel.state;

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <PremiumCard
          imageUrl={travel.thumbnail_url}
          fallbackIcon={<span className="text-6xl">{emoji}</span>}
          category={travel.category}
          categoryColor="bg-orange-500"
          title={travel.title}
          location={location || undefined}
          price={priceValue}
          pricePrefix={pricePrefix}
          priceSuffix={priceSuffix}
          features={features}
          badges={badges}
          isFavorited={favorited}
          onFavorite={() => setFavorited(v => !v)}
          onClick={handleNavigate}
          primaryActionLabel="Tenho Interesse"
          onPrimaryAction={handleInterest}
          aspectRatio="square"
          imageObjectFit="contain"
        />
      </div>

      <ContactIntentionModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        listingId={travel.id}
        listingModule="travel"
        listingTitle={travel.title}
      />
    </div>
  );
};
