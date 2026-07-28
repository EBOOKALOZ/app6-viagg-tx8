import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarketPropertyCard } from '@/components/real-estate/MarketPropertyCard';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { getListingImageUrl } from '@/lib/real-estate/mediaUtils';
interface StorePropertyCarouselProps {
  storeId: string;
  currentPropertyId?: string;
  limit?: number;
}

export const StorePropertyCarousel: React.FC<StorePropertyCarouselProps> = ({ 
  storeId, 
  currentPropertyId,
  limit = 12 
}) => {
  const { data: properties, isLoading } = useQuery({
    queryKey: ['store-properties', storeId, currentPropertyId, limit],
    enabled: !!storeId,
    queryFn: async () => {
      let query = supabase
        .from('public_real_estate_listings')
        .select('*')
        .eq('owner_user_id', storeId)
        .eq('visibility_status', 'published')
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (currentPropertyId) {
        query = query.neq('id', currentPropertyId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      const properties = data || [];
      
      if (properties.length === 0) return [];
      
      const propertiesWithMedia = await Promise.all(properties.map(async (prop) => {
        const { data: media } = await supabase
          .from('real_estate_media')
          .select('original_storage_path, thumb_masked_storage_path')
          .eq('listing_id', prop.id)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle();

        let thumbnailUrl = null;
        if (media) {
            const hasThumb = !!media.thumb_masked_storage_path;
            const storagePath = media.thumb_masked_storage_path || media.original_storage_path;
            if (storagePath) thumbnailUrl = getListingImageUrl(storagePath, hasThumb ? 'public' : 'original');
        }
        return { ...prop, thumbnail_url: thumbnailUrl };
      }));
      
      return propertiesWithMedia;
    }
  });

  if (isLoading) {
    return (
      <div className="w-full py-6 flex space-x-4 overflow-x-auto no-scrollbar">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-w-[280px] md:min-w-[320px] h-[360px] bg-white/50 rounded-2xl animate-pulse shrink-0" />
        ))}
      </div>
    );
  }

  if (!properties || properties.length === 0) {
    return null;
  }

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-lg md:text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Home className="w-5 h-5 text-[#2563eb]" />
          Outros imóveis desta imobiliária
        </h3>
        <Link to={`/imoveis/imobiliaria/${storeId}`}>
          <Button variant="ghost" className="text-[#2563eb] text-sm hover:bg-blue-50 h-8 px-3 rounded-full">
            Ver todos
          </Button>
        </Link>
      </div>
      
      <div className="relative group">
        <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {properties.map((property: any) => (
            <div key={property.id} className="snap-start shrink-0 w-[280px] md:w-[320px]">
              <MarketPropertyCard property={property} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
