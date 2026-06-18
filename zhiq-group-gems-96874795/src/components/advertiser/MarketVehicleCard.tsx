import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Car, 
  MapPin, 
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Settings,
  Store,
  Heart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorFingerprint } from '@/lib/cpcTracker';

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
      'carro': 'bg-[#FF6A00] text-white',
      'moto': 'bg-[#FF6A00] text-white',
      'barco': 'bg-[#FF6A00] text-white',
      'utilitario': 'bg-[#FF6A00] text-white'
    };
    return colors[type] || 'bg-[#FF6A00] text-white';
  };

  const handleNavigate = () => {
    navigate(`/veiculos/${vehicle.id}`);
    // A própria página VehicleDetailPage.tsx se encarrega de cobrar a visita 
    // usando charge_vehicle_listing_click, então não precisamos cobrar aqui.
  };

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <Card 
          onClick={handleNavigate}
          className="group overflow-hidden border-none shadow-xl rounded-3xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 bg-white ring-1 ring-zinc-100 hover:ring-[#FF6A00]/40 cursor-pointer"
        >
          {/* 🖼️ IMAGE AREA 🖼️ */}
          <div className="relative aspect-[4/3] overflow-hidden">
            {vehicle.thumbnail_url ? (
              <img 
                src={vehicle.thumbnail_url} 
                alt={vehicle.title}
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
            
            {/* Overlays */}
            <div className="absolute top-0 left-0 p-4">
              <Badge className={cn("font-black uppercase tracking-widest text-[10px] shadow-lg", getVehicleTypeColor(vehicle.vehicle_type))}>
                {getVehicleTypeLabel(vehicle.vehicle_type)}
              </Badge>
            </div>

            {/* Top-right action stack */}
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFavorited(v => !v); }}
                className="bg-white/95 backdrop-blur-md rounded-full p-2 shadow-md hover:shadow-lg hover:scale-110 transition-all"
                aria-label="Salvar"
              >
                <Heart className={cn("w-4 h-4 transition-colors", favorited ? "fill-rose-500 text-rose-500" : "text-zinc-600")} />
              </button>
              <div className="bg-[#FF6A00]/90 backdrop-blur-md text-white rounded-full p-2 shadow-lg scale-90 group-hover:scale-100 transition-transform flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>


          </div>

          {/* 📃 CONTENT 📃 */}
          <CardContent className="p-5 space-y-4">
            <div className="text-[#FF6A00] font-black text-2xl tracking-tighter">
              {formatCurrencyBRL(vehicle.price_brl)}
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-zinc-900 leading-tight line-clamp-2 h-10 group-hover:text-[#FF6A00] transition-colors">
                {vehicle.title}
              </h3>
              <div className="flex items-center gap-1.5 text-zinc-400 font-bold text-[10px] uppercase tracking-wider">
                <MapPin className="w-3 h-3 text-[#FF6A00]" />
                {vehicle.city}, {vehicle.state}
              </div>
            </div>

            {/* Specs Grid */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-50">
               <div className="flex items-center gap-2 text-zinc-900">
                  <Car className="w-4 h-4 text-[#FF6A00]" />
                  <span className="text-xs font-bold">{vehicle.year}</span>
               </div>
               {vehicle.transmission && (
                 <div className="flex items-center gap-2 text-zinc-900">
                    <Settings className="w-4 h-4 text-[#FF6A00]" />
                    <span className="text-xs font-bold capitalize">{vehicle.transmission}</span>
                 </div>
               )}
            </div>
          </CardContent>

          <CardFooter className="px-5 pb-6 pt-0">
            <Button 
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate();
              }}
              className="w-full bg-[#FF6A00] hover:bg-orange-700 text-white rounded-2xl font-black text-sm h-12 group/btn shadow-lg"
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
