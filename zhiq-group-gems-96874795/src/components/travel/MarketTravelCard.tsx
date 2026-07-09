import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronRight, ShieldCheck, Plane, Heart, Star, Calendar, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { resolveTravelCategoryEmoji } from '@/lib/viagem/travelCategories';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';

interface MarketTravelCardProps {
  travel: {
    id: string;
    title: string;
    category: string;
    price_per_person?: number | null;
    total_price?: number | null;
    entry_price?: string | null;
    destination?: string | null;
    city?: string | null;
    state?: string | null;
    departure_date?: string | null;
    duration_days?: number | null;
    thumbnail_url?: string | null;
    is_featured?: boolean;
    is_promoted?: boolean;
  };
}

export const MarketTravelCard: React.FC<MarketTravelCardProps> = ({ travel }) => {
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const emoji = resolveTravelCategoryEmoji(travel.category);

  const handleNavigate = () => {
    navigate(`/viagens/${travel.id}`);
  };

  const handleInterest = (e: React.MouseEvent) => {
    e.stopPropagation();
    setContactOpen(true);
  };

  const priceDisplay = travel.entry_price?.trim()
    || (travel.price_per_person ? `R$ ${Number(travel.price_per_person).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/ pessoa` : null)
    || (travel.total_price ? `R$ ${Number(travel.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : null)
    || 'Consulte';

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-sm">
        <Card
          onClick={handleNavigate}
          className={cn(
            "group overflow-hidden border-none shadow-xl rounded-3xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 bg-gradient-to-br from-sky-50 to-blue-100 ring-1 cursor-pointer",
            travel.is_featured ? "ring-2 ring-sky-400" : "ring-sky-200 hover:ring-sky-400/60"
          )}
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            {travel.thumbnail_url ? (
              <img
                src={travel.thumbnail_url}
                alt={travel.title}
                className="w-full h-full object-contain bg-zinc-900 transition-transform duration-700"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-50 to-sky-100 flex items-center justify-center">
                <span className="text-6xl">{emoji}</span>
              </div>
            )}

            <div className="absolute top-0 left-0 p-4 flex flex-col gap-2 items-start">
              <Badge className="font-black uppercase tracking-widest text-[10px] shadow-lg bg-orange-500 text-white">
                {travel.category}
              </Badge>
              {travel.is_featured && (
                <Badge className="font-black uppercase tracking-widest text-[10px] shadow-lg bg-amber-500 text-white flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" /> Destaque
                </Badge>
              )}
              {travel.is_promoted && (
                <Badge className="font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center gap-1 border-0 text-white" style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}>
                  <Zap className="w-3 h-3 fill-current" /> Promovido
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
              <div className="bg-orange-500/90 backdrop-blur-md text-white rounded-full p-2 shadow-lg scale-90 group-hover:scale-100 transition-transform flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sky-600 font-black text-lg tracking-tighter break-words">
                {priceDisplay}
              </div>
              {!!travel.duration_days && (
                <span className="text-[11px] font-black text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-2 py-1 shrink-0 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {travel.duration_days}d
                </span>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-zinc-900 leading-snug break-words group-hover:text-sky-600 transition-colors">
                {travel.title}
              </h3>
              {(travel.destination || travel.city) && (
                <div className="flex items-start gap-1.5 text-zinc-700 font-bold text-[10px] uppercase tracking-wider">
                  <MapPin className="w-3 h-3 text-sky-600 shrink-0 mt-[1px]" />
                  <span className="break-words leading-snug">
                    {travel.destination ? `${travel.destination}` : ''}
                    {travel.city ? ` · ${travel.city}` : ''}
                    {travel.state ? `, ${travel.state}` : ''}
                  </span>
                </div>
              )}
              {travel.departure_date && (
                <div className="flex items-center gap-1.5 text-zinc-700 font-semibold text-[10px] pt-0.5">
                  <Calendar className="w-3 h-3 text-sky-500 shrink-0" />
                  <span>Saída: {new Date(travel.departure_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-yellow-300">
              <span className="text-lg shrink-0">{emoji}</span>
              <span className="text-xs font-bold text-zinc-700 break-words">{travel.category}</span>
            </div>
          </CardContent>

          <CardFooter className="px-5 pb-6 pt-0">
            {/* Mobile-safe: sem nowrap/padding largo — o texto "TENHO INTERESSE"
                aparece inteiro mesmo em card estreito (grid 2 col no celular). */}
            <Button
              onClick={handleInterest}
              className="w-full bg-sky-400 hover:bg-sky-500 text-white rounded-2xl font-black text-xs sm:text-sm h-12 px-2 gap-1.5 group/btn shadow-lg"
            >
              <Plane className="hidden sm:block w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">TENHO INTERESSE</span>
              <ChevronRight className="hidden sm:block w-4 h-4 shrink-0 group-hover/btn:translate-x-1 transition-transform" />
            </Button>
          </CardFooter>
        </Card>
      </div>

      <ContactIntentionModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        listingId={travel.id}
        listingModule="travel"
        listingTitle={travel.title}
      />
    </div>
  );
};
