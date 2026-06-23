import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  ChevronRight,
  ShieldCheck,
  Truck,
  Heart,
  Star,
  Route,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn } from '@/lib/utils';
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
    // FreightDetailPage.tsx cobra a visita via charge_freight_listing_click.
  };

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <Card
          onClick={handleNavigate}
          className={cn(
            "group overflow-hidden border-none shadow-xl rounded-3xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 bg-white ring-1 cursor-pointer",
            freight.is_featured ? "ring-2 ring-amber-400" : "ring-zinc-100 hover:ring-blue-500/40"
          )}
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            {freight.thumbnail_url ? (
              <img
                src={freight.thumbnail_url}
                alt={freight.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => {
                  const fallback = getMediaFallbackUrl((e.target as HTMLImageElement).src);
                  if (fallback) (e.target as HTMLImageElement).src = fallback;
                }}
              />
            ) : (
              <div className="w-full h-full bg-zinc-100 flex items-center justify-center">
                <Truck className="w-12 h-12 text-zinc-300" />
              </div>
            )}

            <div className="absolute top-0 left-0 p-4 flex flex-col gap-2 items-start">
              <Badge className="font-black uppercase tracking-widest text-[10px] shadow-lg bg-blue-600 text-white">
                {freight.vehicle_type}
              </Badge>
              {freight.is_featured && (
                <Badge className="font-black uppercase tracking-widest text-[10px] shadow-lg bg-amber-500 text-white flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" /> Destaque
                </Badge>
              )}
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
              <div className="bg-blue-600/90 backdrop-blur-md text-white rounded-full p-2 shadow-lg scale-90 group-hover:scale-100 transition-transform flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          <CardContent className="p-5 space-y-4">
            <div className="flex items-end justify-between gap-2">
              <div className="text-blue-600 font-black text-2xl tracking-tighter">
                {freight.price_label?.trim() || 'Consulte'}
              </div>
              {!!freight.price_per_km && (
                <span className="text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 shrink-0">
                  R$ {Number(freight.price_per_km).toFixed(2)}/km
                </span>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-zinc-900 leading-tight line-clamp-2 h-10 group-hover:text-blue-600 transition-colors">
                {freight.title}
              </h3>
              <div className="flex items-center gap-1.5 text-zinc-400 font-bold text-[10px] uppercase tracking-wider">
                <MapPin className="w-3 h-3 text-blue-600" />
                {freight.city}, {freight.state}
              </div>
              {!!freight.coverage_routes?.trim() && (
                <div className="flex items-start gap-1.5 text-zinc-400 font-semibold text-[10px] pt-0.5">
                  <Route className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{freight.coverage_routes}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 pt-3 border-t border-zinc-50">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-blue-200/60 shrink-0">
                <TypeIcon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-xs font-bold text-zinc-900">{freight.vehicle_type}</span>
            </div>
          </CardContent>

          <CardFooter className="px-5 pb-6 pt-0">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm h-12 group/btn shadow-lg"
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
