import React, { useState } from 'react';
import { Route, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PremiumCard, PremiumBadge, PremiumFeature } from '@/components/ui/PremiumCard';
import { resolveFreightVehicleIcon } from '@/lib/freight/vehicleTypes';

interface MarketFreightCardProps {
  freight: {
    id: string;
    title: string;
    vehicle_type: string;
    price_label?: string | null;
    price_per_km?: number | null;
    coverage_routes?: string | null;
    city: string;
    state: string;
    thumbnail_url?: string;
    is_featured?: boolean;
  };
}

export const MarketFreightCard: React.FC<MarketFreightCardProps> = ({ freight }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);

  const TypeIcon = resolveFreightVehicleIcon(freight.vehicle_type);

  const handleNavigate = () => {
    navigate(`/fretes/${freight.id}`);
  };

  const features: PremiumFeature[] = [];
  if (freight.price_per_km) {
    features.push({
      icon: <Truck className="w-full h-full" />,
      label: `R$ ${Number(freight.price_per_km).toFixed(2)}/km`
    });
  }
  if (freight.coverage_routes) {
    features.push({
      icon: <Route className="w-full h-full" />,
      label: freight.coverage_routes
    });
  }

  const badges: PremiumBadge[] = [
    { label: 'Verificado', variant: 'verified' }
  ];
  if (freight.is_featured) {
    badges.push({ label: 'Destaque', variant: 'featured' });
  }

  let parsedPrice: number | null = null;
  if (freight.price_label) {
    const numericMatch = freight.price_label.replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/);
    if (numericMatch) {
      parsedPrice = parseFloat(numericMatch[0]);
    }
  }

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <PremiumCard
          imageUrl={freight.thumbnail_url}
          fallbackIcon={<Truck className="w-12 h-12 text-zinc-300" />}
          category={freight.vehicle_type}
          categoryColor="bg-blue-600"
          title={freight.title}
          location={`${freight.city}, ${freight.state}`}
          price={parsedPrice}
          pricePrefix={freight.price_label && !parsedPrice ? freight.price_label : 'R$'}
          features={features}
          badges={badges}
          isFavorited={favorited}
          onFavorite={() => setFavorited(v => !v)}
          onClick={handleNavigate}
          primaryActionLabel="Tenho Interesse"
          aspectRatio="square"
        />
      </div>
    </div>
  );
};
