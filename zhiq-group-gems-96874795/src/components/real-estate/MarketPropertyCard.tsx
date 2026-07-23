import React, { useState } from 'react';
import { BedDouble, Bath, Car, MapPin, Maximize2, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { CardDark, CardImageOverlay, DarkBadge } from '@/components/ui/dark-card';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { CardTopBar } from '@/components/ui/CardTopBar';
import { publicAdvertiserPath } from '@/lib/business-modules';

interface MarketPropertyCardProps {
  property: {
    id: string;
    title: string;
    description?: string | null;
    property_type: string;
    purpose?: 'venda' | 'aluguel' | string;
    price_brl: number;
    total_area_m2: number;
    built_area_m2?: number | null;
    land_area_m2?: number | null;
    bedrooms?: number;
    suites?: number;
    bathrooms?: number;
    parking_spots?: number;
    garage_spots?: number;
    accepts_financing?: boolean;
    condo_fee_brl?: number | null;
    iptu_brl?: number | null;
    construction_year?: number | null;
    property_code?: string | null;
    seller_label?: string | null;
    public_location: string;
    public_address_label?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    thumbnail_url?: string;
    owner_user_id?: string | null;
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
  const requireAuth = useRequireAuth();
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
      'terreno': 'Terreno', 'lote': 'Lote Urbano', 'casa': 'Casa',
      'apartamento': 'Apartamento', 'comercial': 'Comercial'
    };
    return labels[type] || type || 'Imóvel';
  };

  const getPropertyTypeTone = (type: string): 'green' | 'orange' | 'gray' => {
    const tones: Record<string, 'green' | 'orange' | 'gray'> = {
      'sitio': 'green',
      'fazenda': 'orange',
      'chacara': 'green',
      'casa': 'green',
      'apartamento': 'green',
      'terreno': 'gray',
      'lote': 'gray',
      'comercial': 'orange'
    };
    return tones[type] || 'green';
  };

  const goToDetail = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Novo fluxo: abre a página pública da IMOBILIÁRIA com o imóvel em destaque;
    // sem dono conhecido, cai na página de detalhe isolada.
    if (property.owner_user_id) {
      navigate(publicAdvertiserPath('imoveis', property.owner_user_id, property.id));
    } else {
      navigate(`/imoveis/${property.id}`);
    }
    try {
      supabase.rpc('rpc_register_property_click', {
        p_listing_id: property.id,
        p_visitor_fingerprint: getVisitorFingerprint(),
      }).catch(() => {});
    } catch (err) {}
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    requireAuth(() => setFavorited(v => !v), {
      kind: 'favorite',
      label: 'favoritar este anúncio',
      payload: { id: property.id },
    });
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/imoveis/${property.id}`;
    if (navigator.share) {
      navigator.share({ title: property.title, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  const isLoteArea = ['lote', 'terreno'].includes(String(property.property_type || '').toLowerCase());
  const areaValue = property.total_area_m2 || property.land_area_m2 || property.built_area_m2;
  const areaLabel = areaValue
    ? (isLoteArea || areaValue < 10000
        ? `${areaValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`
        : `${(areaValue / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ha`)
    : '—';

  const isAluguel = String(property.purpose || '').toLowerCase() === 'aluguel';
  const formattedPrice = formatCurrencyBRL(property.price_brl).replace(/^R\$\s*/, '');
  const totalSpots = property.parking_spots ?? property.garage_spots ?? 0;

  return (
    <CardDark
      onClick={goToDetail}
      className={cn(
        "group relative flex flex-col w-full h-full cursor-pointer transition-all duration-300 ease-out hover:border-[#3E4854] hover:shadow-[0_16px_40px_rgba(0,0,0,0.5)] lg:hover:-translate-y-0.5",
        isFeatured && "md:col-span-2 lg:col-span-2"
      )}
    >
      {/* ─── 1. IMAGEM PRINCIPAL (~55% do card) ─── */}
      <div className={cn("relative w-full aspect-[4/3] sm:aspect-[1.15] overflow-hidden bg-[#252B33] shrink-0")}>
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

        {/* Header Universal do card (logo + modalidade + verificado + ações) */}
        <CardTopBar
          modality={isAluguel ? 'aluguel' : 'venda'}
          verified
          favorited={favorited}
          onShare={handleShareClick}
          onFavorite={handleFavoriteClick}
        />

        {/* Tipo do imóvel + Destaque — abaixo da barra universal */}
        <div className="absolute top-16 left-2.5 z-10 flex items-center gap-1.5 pointer-events-none">
          <DarkBadge tone={getPropertyTypeTone(property.property_type)} className="shadow-md backdrop-blur-md bg-[#1A1F24]/85">
            {getPropertyTypeLabel(property.property_type)}
          </DarkBadge>
          {isFeatured && <DarkBadge tone="orange" className="shadow-md backdrop-blur-md bg-[#1A1F24]/85">Destaque</DarkBadge>}
        </div>

        {/* Watermark central VX — reforço de marca */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-[5]"
        >
          <span className="font-black tracking-tighter text-white/[0.07] mix-blend-overlay text-6xl sm:text-7xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
            VX
          </span>
        </div>

        {/* Selo institucional e Código no canto inferior esquerdo */}
        <div className="absolute bottom-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
          <div className="flex items-center gap-1 rounded-full bg-[#1A1F24]/85 backdrop-blur-md px-2.5 py-1 shadow-md ring-1 ring-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C58E] shrink-0" aria-hidden="true" />
            <span className="text-[9px] font-black uppercase tracking-wider text-white/95">Oficial Viagg-TX8</span>
          </div>
          {property.property_code && (
            <span className="rounded-full bg-[#1A1F24]/85 backdrop-blur-md px-2 py-0.5 text-[9px] font-bold text-[#8E98A3] ring-1 ring-white/10">
              COD: {property.property_code}
            </span>
          )}
        </div>

        {/* Gradiente de leitura suave sobre a foto */}
        <CardImageOverlay className="z-10" />
      </div>

      {/* ─── CORPO DO CARD ─── */}
      <div className="flex flex-col flex-1 p-5 sm:p-6 space-y-3">
        {/* 2. Nome do Imóvel (Fonte grande e forte) */}
        <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 group-hover:text-[#00C58E] transition-colors">
          {property.title}
        </h3>

        {/* 3. Valor em destaque (Fonte maior, cor verde institucional) */}
        <div className="pt-0.5">
          <p className="text-2xl font-black text-[#00C58E] tracking-tight flex items-baseline">
            <span className="text-sm font-normal mr-1">R$</span>
            <span>{formattedPrice}</span>
            {isAluguel && <span className="text-xs font-normal text-[#B8C2CC] ml-1">/mês</span>}
          </p>
        </div>

        {/* 4. Informações Rápidas (Ícones no mesmo padrão visual) */}
        <div className="flex items-center flex-wrap gap-2 pt-1.5 text-xs font-semibold text-[#B8C2CC]">
          {/* Localização / Bairro */}
          <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl max-w-full truncate" title={completeAddress}>
            <MapPin className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
            <span className="truncate">{completeAddress}</span>
          </div>

          {/* Área m² */}
          <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl shrink-0">
            <Maximize2 className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
            <span>{areaLabel}</span>
          </div>

          {/* Dormitórios */}
          {(property.bedrooms ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl shrink-0">
              <BedDouble className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span>
                {property.bedrooms} {property.bedrooms === 1 ? 'Quarto' : 'Quartos'}
                {property.suites ? ` (${property.suites} suíte${property.suites > 1 ? 's' : ''})` : ''}
              </span>
            </div>
          )}

          {/* Banheiros */}
          {(property.bathrooms ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl shrink-0">
              <Bath className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span>{property.bathrooms} {property.bathrooms === 1 ? 'Banheiro' : 'Banheiros'}</span>
            </div>
          )}

          {/* Vagas */}
          {totalSpots > 0 && (
            <div className="flex items-center gap-1.5 bg-[#252B33] border border-[#323A45] px-2.5 py-1 rounded-xl shrink-0">
              <Car className="w-3.5 h-3.5 text-[#00C58E] shrink-0" />
              <span>{totalSpots} {totalSpots === 1 ? 'Vaga' : 'Vagas'}</span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ─── 5. VENDEDOR & 6. BOTÃO PRINCIPAL ─── */}
        <div className="pt-3 border-t border-[#323A45] mt-auto space-y-3">
          {/* Vendedor */}
          <div className="flex items-center justify-between text-xs text-[#B8C2CC]">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full overflow-hidden border border-[#323A45] bg-[#252B33] shrink-0 flex items-center justify-center">
                {property.merchant?.avatarUrl ? (
                  <img src={property.merchant.avatarUrl} className="w-full h-full object-cover" alt={property.merchant?.name || 'Anunciante'} />
                ) : (
                  <Store className="w-3.5 h-3.5 text-[#00C58E]" />
                )}
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-[10px] font-bold text-[#8E98A3] uppercase tracking-wider">Anunciante</span>
                <span className="text-xs font-bold text-[#B8C2CC] truncate">
                  {property.merchant?.name || property.seller_label || 'Corretor / Proprietário'}
                </span>
              </div>
            </div>
            {property.merchant?.isOfficial && (
              <DarkBadge tone="green" className="text-[9px] px-1.5 py-0.5">Oficial</DarkBadge>
            )}
          </div>

          {/* Botão Principal — Cor azul institucional da Viagg-TX8, bordas arredondadas, hover premium */}
          <button
            onClick={goToDetail}
            className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-md hover:shadow-blue-500/20 transition-all duration-200 active:scale-[0.98]"
          >
            Tenho Interesse
          </button>
        </div>
      </div>
    </CardDark>
  );
};

