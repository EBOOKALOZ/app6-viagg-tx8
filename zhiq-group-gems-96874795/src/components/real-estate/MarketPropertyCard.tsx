import React, { useState } from 'react';
import { BedDouble, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { PremiumCard, PremiumBadge, PremiumFeature } from '@/components/ui/PremiumCard';
import { cn } from '@/lib/utils';

interface MarketPropertyCardProps {
  property: {
    id: string;
    title: string;
    description?: string | null;
    property_type: string;
    price_brl: number;
    total_area_m2: number;
    bedrooms?: number;
    bathrooms?: number;
    public_location: string;
    public_address_label?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    thumbnail_url?: string;
    merchant?: {
      name: string;
      avatarUrl?: string | null;
      isOfficial?: boolean;
    };
  };
  variant?: 'default' | 'featured';
}

export const MarketPropertyCard: React.FC<MarketPropertyCardProps> = ({ property, variant = 'default' }) => {
  const isFeatured = variant === 'featured';
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);

  const completeAddress = (() => {
    if (property.public_address_label && property.public_address_label.trim()) {
      return property.public_address_label.trim();
    }
    const parts: string[] = [];
    if (property.neighborhood && property.neighborhood.trim()) {
      parts.push(property.neighborhood.trim());
    }
    if (property.city && property.state) {
      parts.push(`${property.city.trim()}/${property.state.trim()}`);
    } else if (property.city) {
      parts.push(property.city.trim());
    } else if (property.state) {
      parts.push(property.state.trim());
    }
    if (parts.length > 0) {
      return parts.join(', ');
    }
    return property.public_location || 'Localização sob consulta';
  })();

  const getPropertyTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'sitio': 'Sítio', 'fazenda': 'Fazenda', 'chacara': 'Chácara',
      'terreno': 'Terreno', 'lote': 'Lote Urbano'
    };
    return labels[type] || type;
  };

  const getPropertyTypeAccent = (type: string) => {
    const colors: Record<string, string> = {
      'sitio': 'bg-green-600',
      'fazenda': 'bg-orange-600',
      'chacara': 'bg-teal-600',
      'terreno': 'bg-blue-600',
      'lote': 'bg-indigo-600'
    };
    return colors[type] || 'bg-emerald-600';
  };

  const goToDetail = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(`/imoveis/${property.id}`);
    try {
      supabase.rpc('rpc_register_property_click', {
        p_listing_id: property.id,
        p_visitor_fingerprint: getVisitorFingerprint(),
      }).catch(() => {});
    } catch (err) {}
  };

  const isLoteArea = ['lote', 'terreno'].includes(String(property.property_type || '').toLowerCase());
  const areaLabel = property.total_area_m2
    ? (isLoteArea
        ? `${property.total_area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`
        : `${(property.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ha`)
    : '—';

  const features: PremiumFeature[] = [
    { icon: <Maximize2 className="w-full h-full" />, label: areaLabel }
  ];
  if ((property.bedrooms ?? 0) > 0) {
    features.push({ icon: <BedDouble className="w-full h-full" />, label: `${property.bedrooms} Quartos` });
  }

  const badges: PremiumBadge[] = [];
  if (isFeatured) {
    badges.push({ label: 'Destaque', variant: 'featured' });
  }
  // All properties get the verified badge as in the old UI
  badges.push({ label: 'Verificado', variant: 'verified' });

  return (
    <PremiumCard
      imageUrl={property.thumbnail_url}
      category={getPropertyTypeLabel(property.property_type)}
      categoryColor={getPropertyTypeAccent(property.property_type)}
      title={property.title}
      location={completeAddress}
      price={property.price_brl}
      features={features}
      badges={badges}
      isFavorited={favorited}
      onFavorite={() => setFavorited(v => !v)}
      onClick={goToDetail}
      className={cn(isFeatured && "md:col-span-2 lg:col-span-2")}
      aspectRatio={isFeatured ? 'video' : 'square'}
      merchant={property.merchant}
    />
  );
};
