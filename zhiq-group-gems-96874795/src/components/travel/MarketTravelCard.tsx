import React, { useState } from 'react';
import { Calendar, Heart, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  CardDark,
  CardHighlight,
  CardInfo,
  CardImageOverlay,
  DarkBadge,
  DarkButton,
} from '@/components/ui/dark-card';
import { formatCurrencyBRL } from '@/lib/utils';
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

interface CardFeature {
  icon: React.ReactNode;
  label: string | number;
}

interface CardBadge {
  label: string;
  tone: 'green' | 'orange' | 'red' | 'gray';
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

  const features: CardFeature[] = [];
  if (travel.duration_days) {
    features.push({
      icon: <Calendar className="w-full h-full" />,
      label: `${travel.duration_days}d`
    });
  }
  if (travel.departure_date) {
    features.push({
      icon: <Calendar className="w-full h-full" />,
      label: `Saída: ${new Date(travel.departure_date + 'T12:00:00').toLocaleDateString('pt-BR')}`
    });
  }

  const badges: CardBadge[] = [
    { label: 'Verificado', tone: 'green' }
  ];
  if (travel.is_featured) {
    badges.push({ label: 'Destaque', tone: 'orange' });
  }
  if (travel.is_promoted) {
    badges.push({ label: 'Promovido', tone: 'gray' });
  }

  const priceValue = travel.price_per_person || travel.total_price || null;
  const pricePrefix = travel.entry_price?.trim() || 'R$';
  const priceSuffix = travel.price_per_person ? '/ pessoa' : '';

  let location = '';
  if (travel.destination) location += travel.destination;
  if (travel.city) location += (location ? ' · ' : '') + travel.city;
  if (travel.state) location += (location ? ', ' : '') + travel.state;

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-md">
        <CardDark
          onClick={handleNavigate}
          className="group relative flex flex-col w-full cursor-pointer transition-all duration-300 ease-out hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {/* ─── 1. IMAGEM ─── */}
          <div className="relative w-full aspect-square overflow-hidden bg-[#252B33] shrink-0">
            {travel.thumbnail_url ? (
              <img
                src={travel.thumbnail_url}
                alt={travel.title}
                loading="lazy"
                className="w-full h-full object-contain bg-[#1A1F24] transition-transform duration-700 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#8E98A3]">
                <span className="text-6xl">{emoji}</span>
              </div>
            )}

            {/* Logo da plataforma (topo, canto superior esquerdo) */}
            <img
              src="/viagg-logo.png"
              alt="Viagg-TX8"
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              className="absolute top-2.5 left-2.5 z-20 h-11 w-11 rounded-lg object-cover shadow-md ring-1 ring-white/20 pointer-events-none"
            />

            {/* Badges (direita, abaixo do favoritar) */}
            <div className="absolute top-14 right-3 flex flex-col items-end flex-wrap gap-1.5 z-10 pointer-events-none">
              {badges.map((badge, idx) => (
                <DarkBadge key={idx} tone={badge.tone}>{badge.label}</DarkBadge>
              ))}
            </div>

            {/* Favoritar */}
            <button
              onClick={(e) => { e.stopPropagation(); setFavorited(v => !v); }}
              className="absolute top-3 right-3 z-10 p-2.5 rounded-full bg-[#1A1F24]/80 border border-[#323A45] hover:bg-[#252B33] shadow-sm backdrop-blur-md transition-all duration-200"
            >
              <Heart className={favorited ? 'w-4 h-4 fill-red-500 text-red-500 scale-110 transition-all duration-300' : 'w-4 h-4 text-[#B8C2CC] transition-all duration-300'} />
            </button>

            {/* Watermark VX */}
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[5]">
              <span className="font-black tracking-tighter text-white/[0.07] mix-blend-overlay text-6xl sm:text-7xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
                VX
              </span>
            </div>

            {/* Selo institucional */}
            <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1 pointer-events-none shadow-md ring-1 ring-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C58E] shrink-0" aria-hidden="true" />
              <span className="text-[9px] font-black uppercase tracking-wider text-white/95">Oficial Viagg-TX8</span>
            </div>

            <CardImageOverlay />
          </div>

          {/* ─── CORPO ─── */}
          <div className="flex flex-col flex-1 p-4 sm:p-5 space-y-3">
            {/* 2. Título */}
            <h3 className="text-base sm:text-lg font-black text-white leading-snug line-clamp-2 group-hover:text-[#FF7A00] transition-colors">
              {travel.title}
            </h3>

            {/* 3. Preço */}
            {priceValue !== null ? (
              <CardHighlight
                label="Preço"
                value={
                  <>
                    <span className="mr-1 text-xs font-bold">{pricePrefix}</span>
                    {formatCurrencyBRL(priceValue).replace('R$', '').trim()}
                    {priceSuffix && <span className="ml-1 text-xs font-semibold text-[#8E98A3]">{priceSuffix}</span>}
                  </>
                }
              />
            ) : (
              <CardInfo>
                <p className="text-sm font-bold text-[#B8C2CC] uppercase tracking-wide">Preço sob consulta</p>
              </CardInfo>
            )}

            {/* 4. Categoria */}
            <div className="pt-1">
              <DarkBadge tone="gray">{travel.category}</DarkBadge>
            </div>

            {/* 5. Localização — ícone verde + texto cinza claro */}
            {location && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <MapPin className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
                <span className="text-xs font-medium text-[#B8C2CC] truncate">{location}</span>
              </div>
            )}

            {/* 6. Especificações */}
            {features.length > 0 && (
              <div className="flex items-center flex-wrap gap-2 pt-1.5">
                {features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 rounded-xl bg-[#252B33] border border-[#323A45] px-2.5 py-1">
                    <span className="text-[#00C58E] w-3.5 h-3.5 flex items-center justify-center shrink-0">{feature.icon}</span>
                    <span className="text-xs font-semibold text-[#B8C2CC] truncate max-w-[140px]">{feature.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1" />

            {/* 7. Botão */}
            <div className="pt-3 border-t border-[#323A45] mt-auto">
              <DarkButton
                onClick={handleInterest}
                className="w-full h-11 py-0 text-xs flex items-center justify-center"
              >
                Tenho Interesse
              </DarkButton>

              {/* Rodapé institucional */}
              <div className="mt-2.5 flex items-center justify-center gap-1.5 select-none pointer-events-none opacity-80">
                <img
                  src="/viagg-logo.png"
                  alt=""
                  aria-hidden="true"
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 rounded object-cover"
                />
                <span className="text-[9px] font-bold tracking-wide text-[#8E98A3]">Marketplace Oficial Viagg-TX8™</span>
              </div>
            </div>
          </div>
        </CardDark>
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
