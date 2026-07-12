import React, { useState } from 'react';
import { Car, Settings, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PremiumCard, PremiumBadge, PremiumFeature } from '@/components/ui/PremiumCard';
import { cn } from '@/lib/utils';

interface MarketVehicleCardProps {
  vehicle: {
    id: string;
    title: string;
    vehicle_type: string;
    price_brl: number;
    brand: string;
    model: string;
    year: number;
    fuel_type?: string;
    transmission?: string;
    city: string;
    state: string;
    thumbnail_url?: string;
  };
}

export const MarketVehicleCard: React.FC<MarketVehicleCardProps> = ({ vehicle }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);

  const getVehicleTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'carro': 'Carro', 'moto': 'Moto', 'barco': 'Barco', 'utilitario': 'Utilitário'
    };
    return labels[type] || type || 'Veículo';
  };

  const getVehicleTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'carro': 'bg-[#FF6A00]',
      'moto': 'bg-[#FF6A00]',
      'barco': 'bg-[#FF6A00]',
      'utilitario': 'bg-[#FF6A00]'
    };
    return colors[type] || 'bg-[#FF6A00]';
  };

  const handleNavigate = () => {
    navigate(`/veiculos/${vehicle.id}`);
  };

  const features: PremiumFeature[] = [
    { icon: <Car className="w-full h-full" />, label: vehicle.year }
  ];
  
  if (vehicle.transmission) {
    features.push({ 
      icon: <Settings className="w-full h-full" />, 
      label: vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1) 
    });
  }

  const badges: PremiumBadge[] = [
    { label: 'Verificado', variant: 'verified' }
  ];

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <PremiumCard
          imageUrl={vehicle.thumbnail_url}
          fallbackIcon={<Store className="w-12 h-12 text-zinc-300" />}
          category={getVehicleTypeLabel(vehicle.vehicle_type)}
          categoryColor={getVehicleTypeColor(vehicle.vehicle_type)}
          title={vehicle.title}
          location={`${vehicle.city}, ${vehicle.state}`}
          price={vehicle.price_brl}
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
