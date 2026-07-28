import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarketPropertyCard } from '@/components/real-estate/MarketPropertyCard';
import { Sparkles } from 'lucide-react';
import { getListingImageUrl } from '@/lib/real-estate/mediaUtils';

interface RelatedPropertiesCarouselProps {
  currentProperty: {
    id: string;
    city?: string | null;
    neighborhood?: string | null;
    property_type?: string | null;
    price_brl?: number;
  };
  limit?: number;
}

export const RelatedPropertiesCarousel: React.FC<RelatedPropertiesCarouselProps> = ({ 
  currentProperty, 
  limit = 12 
}) => {
  const { data: properties, isLoading } = useQuery({
    queryKey: ['related-properties', currentProperty.id, currentProperty.city, currentProperty.property_type],
    enabled: !!currentProperty.id,
    queryFn: async () => {
      let query = supabase
        .from('public_real_estate_listings')
        .select('*')
        .eq('visibility_status', 'published')
        .neq('id', currentProperty.id)
        .limit(limit);

      // Heuristics for related properties
      if (currentProperty.city) {
        query = query.eq('city', currentProperty.city);
      }
      if (currentProperty.property_type) {
        query = query.eq('property_type', currentProperty.property_type);
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
          <Sparkles className="w-5 h-5 text-amber-500" />
          Imóveis Semelhantes
        </h3>
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
