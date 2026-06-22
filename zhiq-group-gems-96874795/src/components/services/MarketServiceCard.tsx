import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  ChevronRight,
  ShieldCheck,
  Store,
  Heart,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn } from '@/lib/utils';
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
    // ServiceDetailPage.tsx cobra a visita via charge_service_listing_click.
  };

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <Card
          onClick={handleNavigate}
          className="group overflow-hidden border-none shadow-xl rounded-3xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 bg-white ring-1 ring-zinc-100 hover:ring-violet-500/40 cursor-pointer"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            {service.thumbnail_url ? (
              <img
                src={service.thumbnail_url}
                alt={service.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => {
                  const fallback = getMediaFallbackUrl((e.target as HTMLImageElement).src);
                  if (fallback) (e.target as HTMLImageElement).src = fallback;
                }}
              />
            ) : (
              <div className="w-full h-full bg-zinc-100 flex items-center justify-center">
                <Store className="w-12 h-12 text-zinc-300" />
              </div>
            )}

            <div className="absolute top-0 left-0 p-4">
              <Badge className="font-black uppercase tracking-widest text-[10px] shadow-lg bg-violet-600 text-white">
                {typeLabel}
              </Badge>
            </div>

            <div className="absolute top-3 right-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFavorited(v => !v); }}
                className="bg-white/95 backdrop-blur-md rounded-full p-2 shadow-md hover:shadow-lg hover:scale-110 transition-all"
                aria-label="Salvar"
              >
                <Heart className={cn("w-4 h-4 transition-colors", favorited ? "fill-rose-500 text-rose-500" : "text-zinc-600")} />
              </button>
              <div className="bg-violet-600/90 backdrop-blur-md text-white rounded-full p-2 shadow-lg scale-90 group-hover:scale-100 transition-transform flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          <CardContent className="p-5 space-y-4">
            <div className="text-violet-600 font-black text-2xl tracking-tighter">
              {service.price_label?.trim() || 'Consulte'}
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-zinc-900 leading-tight line-clamp-2 h-10 group-hover:text-violet-600 transition-colors">
                {service.title}
              </h3>
              <div className="flex items-center gap-1.5 text-zinc-400 font-bold text-[10px] uppercase tracking-wider">
                <MapPin className="w-3 h-3 text-violet-600" />
                {service.city}, {service.state}
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-3 border-t border-zinc-50">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 ring-1 ring-violet-200/60 shrink-0">
                <TypeIcon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-xs font-bold text-zinc-900">{typeLabel}</span>
            </div>
          </CardContent>

          <CardFooter className="px-5 pb-6 pt-0">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate();
              }}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black text-sm h-12 group/btn shadow-lg"
            >
              TENHO INTERESSE
              <ChevronRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
