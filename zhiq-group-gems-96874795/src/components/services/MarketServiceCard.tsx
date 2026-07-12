import React, { useState } from 'react';
import { Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PremiumCard, PremiumBadge, PremiumFeature } from '@/components/ui/PremiumCard';
import { resolveServiceTypeLabel, resolveServiceTypeIcon } from '@/lib/services/serviceCategories';

interface MarketServiceCardProps {
  service: {
    id: string;
    title: string;
    service_type: string;
    price_label?: string | null;
    city: string;
    state: string;
    thumbnail_url?: string;
  };
}

export const MarketServiceCard: React.FC<MarketServiceCardProps> = ({ service }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);

  const typeLabel = resolveServiceTypeLabel(service.service_type);
  const TypeIcon = resolveServiceTypeIcon(service.service_type);

  const handleNavigate = () => {
    navigate(`/servicos/${service.id}`);
  };

  const features: PremiumFeature[] = [
    { icon: <TypeIcon className="w-full h-full" />, label: typeLabel }
  ];

  const badges: PremiumBadge[] = [
    { label: 'Verificado', variant: 'verified' }
  ];

  // Try to parse price_label as number if possible, or leave as null for "Preço sob consulta"
  let parsedPrice: number | null = null;
  if (service.price_label) {
    const numericMatch = service.price_label.replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/);
    if (numericMatch) {
      parsedPrice = parseFloat(numericMatch[0]);
    }
  }

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <PremiumCard
          imageUrl={service.thumbnail_url}
          fallbackIcon={<Store className="w-12 h-12 text-zinc-300" />}
          category={typeLabel}
          categoryColor="bg-violet-600"
          title={service.title}
          location={`${service.city}, ${service.state}`}
          price={parsedPrice}
          pricePrefix={service.price_label && !parsedPrice ? service.price_label : 'R$'}
          features={features}
          badges={badges}
          isFavorited={favorited}
          onFavorite={() => setFavorited(v => !v)}
          onClick={handleNavigate}
          primaryActionLabel="Ver Serviço"
          aspectRatio="square"
        />
      </div>
    </div>
  );
};
