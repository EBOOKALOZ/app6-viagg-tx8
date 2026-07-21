import React, { useState } from 'react';
import { BedDouble, Heart, MapPin, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { CardDark, CardHighlight, CardImageOverlay, DarkBadge, DarkButton } from '@/components/ui/dark-card';
import { cn, formatCurrencyBRL } from '@/lib/utils';

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

  /* Tons permitidos no dark premium: verde/laranja/vermelho/cinza. */
  const getPropertyTypeTone = (type: string): 'green' | 'orange' | 'gray' => {
    const tones: Record<string, 'green' | 'orange' | 'gray'> = {
      'sitio': 'green',
      'fazenda': 'orange',
      'chacara': 'green',
      'terreno': 'gray',
      'lote': 'gray'
    };
    return tones[type] || 'green';
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

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorited(v => !v);
  };

  const isLoteArea = ['lote', 'terreno'].includes(String(property.property_type || '').toLowerCase());
  const areaLabel = property.total_area_m2
    ? (isLoteArea
        ? `${property.total_area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`
        : `${(property.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ha`)
    : '—';

  return (
    <CardDark
      onClick={goToDetail}
      className={cn(
        "group relative flex flex-col w-full cursor-pointer transition-all duration-300 ease-out hover:border-[#3E4854] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)]",
        isFeatured && "md:col-span-2 lg:col-span-2"
      )}
    >
      {/* ─── 1. IMAGEM ─── */}
      <div className={cn("relative w-full overflow-hidden bg-[#252B33] shrink-0", isFeatured ? "aspect-video" : "aspect-square")}>
        {property.thumbnail_url ? (
          <img
            src={property.thumbnail_url}
            alt={property.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#8E98A3]">
            <div className="w-12 h-12 rounded-2xl bg-[#323A45]/80" />
          </div>
        )}

        {/* Logo oficial da plataforma (topo, canto superior esquerdo) */}
        <img
          src="/viagg-logo.png"
          alt="Viagg-TX8"
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className="absolute top-2.5 left-2.5 z-20 h-7 w-7 rounded-lg object-cover shadow-md ring-1 ring-white/20 pointer-events-none"
        />

        {/* Badges (direita, abaixo do favoritar) */}
        <div className="absolute top-14 right-3 flex flex-col items-end flex-wrap gap-1.5 z-10 pointer-events-none">
          {isFeatured && <DarkBadge tone="orange">Destaque</DarkBadge>}
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
        {/* 2. Vendedor + Título */}
        <div className="space-y-1.5">
          {property.merchant && (
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full overflow-hidden border border-[#323A45] bg-[#252B33] shrink-0 flex items-center justify-center">
                {property.merchant.avatarUrl ? (
                  <img src={property.merchant.avatarUrl} className="w-full h-full object-cover" alt={property.merchant.name} />
                ) : (
                  <span className="text-[10px] font-bold text-[#8E98A3]">{property.merchant.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex items-center gap-1.5 flex-1">
                <span className="text-xs font-bold text-[#B8C2CC] truncate">{property.merchant.name}</span>
                {property.merchant.isOfficial && (
                  <span className="text-[9px] font-black bg-[#FF7A00]/15 text-[#FF7A00] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                    Oficial
                  </span>
                )}
              </div>
            </div>
          )}

          <h3 className="text-base sm:text-lg font-black text-white leading-snug line-clamp-2 group-hover:text-[#FF7A00] transition-colors">
            {property.title}
          </h3>
        </div>

        {/* 3. Preço em destaque */}
        <CardHighlight label="Preço" value={formatCurrencyBRL(property.price_brl)} />

        {/* 4. Categoria */}
        <div className="pt-1">
          <DarkBadge tone={getPropertyTypeTone(property.property_type)}>
            {getPropertyTypeLabel(property.property_type)}
          </DarkBadge>
        </div>

        {/* 5. Localização — ícone verde + texto cinza claro */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <MapPin className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
          <span className="text-xs font-medium text-[#B8C2CC] truncate">{completeAddress}</span>
        </div>

        {/* 6. Especificações */}
        <div className="flex items-center flex-wrap gap-2 pt-1.5">
          <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl">
            <Maximize2 className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
            <span className="text-xs font-semibold text-[#B8C2CC] truncate max-w-[140px]">{areaLabel}</span>
          </div>
          {(property.bedrooms ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl">
              <BedDouble className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span className="text-xs font-semibold text-[#B8C2CC] truncate max-w-[140px]">{property.bedrooms} Quartos</span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* 7. Ação */}
        <div className="pt-3 border-t border-[#323A45] mt-auto">
          <DarkButton
            onClick={goToDetail}
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
  );
};
