import React, { useState } from 'react';
import { Car, Heart, MapPin, Settings, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CardDark, CardHighlight, CardImageOverlay, DarkBadge, DarkButton } from '@/components/ui/dark-card';
import { cn, formatCurrencyBRL } from '@/lib/utils';

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

  const handleNavigate = () => {
    navigate(`/veiculos/${vehicle.id}`);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleNavigate();
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorited(v => !v);
  };

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-md">
        <CardDark
          onClick={handleNavigate}
          className="group relative flex flex-col w-full cursor-pointer transition-all duration-300 ease-out hover:border-[#3E4854] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {/* ─── 1. IMAGEM ─── */}
          <div className="relative w-full overflow-hidden bg-[#252B33] shrink-0 aspect-square">
            {vehicle.thumbnail_url ? (
              <img
                src={vehicle.thumbnail_url}
                alt={vehicle.title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#8E98A3]">
                <Store className="w-12 h-12" />
              </div>
            )}

            {/* Logo oficial da plataforma (topo, canto superior esquerdo) */}
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
              <DarkBadge tone="green">Verificado</DarkBadge>
            </div>

            {/* Favoritar */}
            <button
              onClick={handleFavoriteClick}
              className="absolute top-3 right-3 z-10 p-2.5 rounded-full bg-[#1A1F24]/80 hover:bg-[#1A1F24] border border-[#323A45] shadow-sm backdrop-blur-md transition-all duration-200"
            >
              <Heart
                className={cn("w-4 h-4 transition-all duration-300", favorited ? "fill-red-500 text-red-500 scale-110" : "text-[#B8C2CC]")}
              />
            </button>

            {/* Watermark central VX — reforço de marca */}
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[5]"
            >
              <span className="font-black tracking-tighter text-white/[0.07] mix-blend-overlay text-6xl sm:text-7xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
                VX
              </span>
            </div>

            {/* Selo institucional — canto inferior esquerdo */}
            <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1 rounded-full bg-[#1A1F24]/85 backdrop-blur-md px-2.5 py-1 pointer-events-none shadow-md ring-1 ring-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00C58E] shrink-0" aria-hidden="true" />
              <span className="text-[9px] font-black uppercase tracking-wider text-white/95">Oficial Viagg-TX8</span>
            </div>

            {/* Gradiente de leitura sobre a foto */}
            <CardImageOverlay />
          </div>

          {/* ─── CORPO ─── */}
          <div className="flex flex-col flex-1 p-5 sm:p-6 space-y-3">
            {/* 2. Título */}
            <h3 className="text-base sm:text-lg font-black text-white leading-snug line-clamp-2 group-hover:text-[#FF7A00] transition-colors">
              {vehicle.title}
            </h3>

            {/* 3. Preço em destaque */}
            <CardHighlight label="Preço" value={formatCurrencyBRL(vehicle.price_brl)} />

            {/* 4. Categoria */}
            <div className="pt-1">
              <DarkBadge tone="orange">{getVehicleTypeLabel(vehicle.vehicle_type)}</DarkBadge>
            </div>

            {/* 5. Localização — ícone verde + texto cinza claro */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <MapPin className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span className="text-xs font-medium text-[#B8C2CC] truncate">{vehicle.city}, {vehicle.state}</span>
            </div>

            {/* 6. Especificações */}
            <div className="flex items-center flex-wrap gap-2 pt-1.5">
              <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl">
                <Car className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
                <span className="text-xs font-semibold text-[#B8C2CC] truncate max-w-[140px]">{vehicle.year}</span>
              </div>
              {vehicle.transmission && (
                <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl">
                  <Settings className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
                  <span className="text-xs font-semibold text-[#B8C2CC] truncate max-w-[140px]">
                    {vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* 7. Ação */}
            <div className="pt-3 border-t border-[#323A45] mt-auto">
              <DarkButton
                onClick={handleActionClick}
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
    </div>
  );
};
