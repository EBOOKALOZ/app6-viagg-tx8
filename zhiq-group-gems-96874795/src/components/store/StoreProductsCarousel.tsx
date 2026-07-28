import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingBag, ChevronRight, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { formatCurrencyBRL } from '@/lib/utils';
import { CardDark, CardInfo, CardHighlight, CardImageOverlay } from '@/components/ui/dark-card';

interface StoreProductsCarouselProps {
  storeId: string;
  limit?: number;
}

export const StoreProductsCarousel: React.FC<StoreProductsCarouselProps> = ({ 
  storeId, 
  limit = 12 
}) => {
  const navigate = useNavigate();
  const { data: products, isLoading } = useQuery({
    queryKey: ['store-products', storeId, limit],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merchant_products' as any)
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(limit);
        
      if (error) throw error;
      return data || [];
    }
  });

  if (isLoading) {
    return (
      <div className="w-full py-6 flex space-x-4 overflow-x-auto no-scrollbar">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-w-[240px] md:min-w-[280px] h-[320px] bg-white/50 rounded-2xl animate-pulse shrink-0" />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return null;
  }

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-lg md:text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Store className="w-5 h-5 text-[#2563eb]" />
          Mais produtos desta loja
        </h3>
        <Link to={`/loja/${storeId}`}>
          <Button variant="ghost" className="text-[#2563eb] text-sm hover:bg-blue-50 h-8 px-3 rounded-full">
            Ver loja
          </Button>
        </Link>
      </div>
      
      <div className="relative group">
        <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {products.map((product: any) => (
            <div key={product.id} className="snap-start shrink-0 w-[240px] md:w-[280px]" onClick={() => navigate(`/produto/${product.id}`)}>
              <CardDark className="cursor-pointer h-full transition-transform hover:-translate-y-1">
                {product.images && product.images[0] && (
                  <CardImageOverlay
                    src={product.images[0]}
                    alt={product.title}
                    badge={product.discount_price ? 'Promoção' : undefined}
                  />
                )}
                <CardInfo>
                  <h4 className="font-medium text-white line-clamp-2 text-sm mb-2">{product.title}</h4>
                  <div className="flex items-center gap-2 mt-auto">
                    {product.discount_price ? (
                      <div>
                        <span className="text-xs text-white/50 line-through mr-2">{formatCurrencyBRL(product.price)}</span>
                        <CardHighlight className="text-lg">{formatCurrencyBRL(product.discount_price)}</CardHighlight>
                      </div>
                    ) : (
                      <CardHighlight className="text-lg">{formatCurrencyBRL(product.price)}</CardHighlight>
                    )}
                  </div>
                </CardInfo>
              </CardDark>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
