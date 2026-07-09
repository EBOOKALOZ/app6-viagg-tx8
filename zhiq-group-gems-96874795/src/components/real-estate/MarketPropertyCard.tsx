import React, { useState } from 'react';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Maximize2,
  BedDouble,
  MapPin,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Heart,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getVisitorFingerprint } from '@/lib/cpcTracker';

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

  const getPropertyTypeAccent = (type: string) => {
    const colors: Record<string, string> = {
      'sitio': 'from-green-500 to-emerald-600',
      'fazenda': 'from-amber-500 to-orange-600',
      'chacara': 'from-emerald-500 to-teal-600',
      'terreno': 'from-sky-500 to-blue-600',
      'lote': 'from-indigo-500 to-violet-600'
    };
    return colors[type] || 'from-zinc-500 to-zinc-700';
  };

  // Navega para a página de descrição do anúncio (e registra o clique p/ CPC).
  const goToDetail = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(`/imoveis/${property.id}`);
    try {
      supabase.rpc('rpc_register_property_click', {
        p_listing_id: property.id,
        p_visitor_fingerprint: getVisitorFingerprint(),
      }).then((result) => console.log("[CPC_RESULT]", result)).catch((err) => console.error("[CPC_ERROR]", err));
    } catch (err) {
      console.error("[CPC_TRY_CATCH]", err);
    }
  };

  const priceStr = formatCurrencyBRL(property.price_brl).replace(/^R\$\s?/, '');
  const priceFontSize = priceStr.length > 11 ? "text-base" : priceStr.length > 8 ? "text-[20px]" : "text-[26px]";

  const isLoteArea = ['lote', 'terreno'].includes(String(property.property_type || '').toLowerCase());
  const areaLabel = property.total_area_m2
    ? (isLoteArea
        ? `${property.total_area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`
        : `${(property.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ha`)
    : '—';

  return (
    <Card className={cn(
      "group relative overflow-hidden border border-zinc-200/70 rounded-[28px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-500 hover:shadow-[0_24px_60px_-10px_rgba(16,185,129,0.25)] hover:-translate-y-1.5 hover:border-emerald-200",
      isFeatured && "md:col-span-2 lg:col-span-2 md:grid md:grid-cols-5"
    )}>
      {/* ── IMAGE AREA ── */}
      <div className={cn(
        "relative overflow-hidden",
        isFeatured ? "aspect-[4/3] md:aspect-auto md:col-span-3 md:min-h-[420px]" : "aspect-[4/3]"
      )}>
        {property.thumbnail_url ? (
          <img
            src={property.thumbnail_url}
            alt={property.title}
            className="w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.08]"
            onError={(e) => {
              const fallback = getMediaFallbackUrl((e.target as HTMLImageElement).src);
              if (fallback) (e.target as HTMLImageElement).src = fallback;
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center">
            <TrendingUp className="w-12 h-12 text-zinc-300" />
          </div>
        )}

        {/* Dark gradient on bottom for legibility + depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/20 pointer-events-none" />

        {/* Type badge (top-left) */}
        <div className="absolute top-4 left-4">
          <div className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r text-white shadow-lg backdrop-blur-sm ring-1 ring-white/20",
            getPropertyTypeAccent(property.property_type)
          )}>
            <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
            <span className="font-bold uppercase tracking-widest text-[10px]">
              {getPropertyTypeLabel(property.property_type)}
            </span>
          </div>
        </div>

        {/* Featured ribbon */}
        {isFeatured && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 md:top-auto md:bottom-20 z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-xl ring-1 ring-white/30">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="font-black uppercase tracking-widest text-[10px]">Destaque</span>
            </div>
          </div>
        )}

        {/* Top-right action stack */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFavorited(v => !v); }}
            className="bg-white/95 backdrop-blur-md rounded-full p-2 shadow-md hover:shadow-lg hover:scale-110 transition-all"
            aria-label="Favoritar"
          >
            <Heart className={cn("w-4 h-4 transition-colors", favorited ? "fill-rose-500 text-rose-500" : "text-zinc-600")} />
          </button>
          <div
            className="bg-white/95 backdrop-blur-md rounded-full p-2 shadow-md flex items-center justify-center"
            title="Imóvel verificado"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
        </div>

        {/* Location pill (bottom-left over image) */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md shadow-md max-w-[90%]">
            <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-800 truncate">
              {completeAddress}
            </span>
          </div>
        </div>
      </div>

      <div className={cn(isFeatured && "md:col-span-2 md:flex md:flex-col md:justify-between")}>
      {/* ── CONTENT ── */}
      <CardContent className={cn("p-5 pb-3 space-y-4", isFeatured && "md:p-7")}>
        {/* Price block */}
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
              Valor
            </span>
            <div className="flex items-baseline gap-1">
              <span className={cn("font-bold text-emerald-600/80 pb-1", isFeatured ? "text-sm md:text-base" : "text-[13px]")}>R$</span>
              <span className={cn(
                "leading-tight font-black tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-transparent break-all",
                isFeatured ? "text-[28px] md:text-[34px]" : priceFontSize
              )}>
                {priceStr}
              </span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className={cn(
          "font-black text-zinc-900 leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors",
          isFeatured ? "text-xl md:text-2xl min-h-[3.5rem]" : "text-lg min-h-[3.5rem]"
        )}>
          {property.title}
        </h3>

        {/* Description preview — foto do anúncio ao fundo (clicável) + overlay p/ legibilidade */}
        {property.description && property.description.trim() && (
          <div
            onClick={goToDetail}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') goToDetail(); }}
            aria-label={`Ver detalhes de ${property.title}`}
            className="relative overflow-hidden rounded-2xl ring-1 ring-zinc-200/60 min-h-[92px] flex items-end cursor-pointer transition-transform duration-300 hover:scale-[1.01]"
          >
            {property.thumbnail_url ? (
              <>
                <img
                  src={property.thumbnail_url}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover scale-105"
                  onError={(e) => {
                    const fb = getMediaFallbackUrl((e.target as HTMLImageElement).src);
                    if (fb) (e.target as HTMLImageElement).src = fb;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/65 to-black/50" />
              </>
            ) : (
              <div className="absolute inset-0 bg-zinc-100" />
            )}
            <p className={cn(
              "relative px-3.5 py-3 leading-relaxed line-clamp-2",
              property.thumbnail_url
                ? "text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]"
                : "text-zinc-600",
              isFeatured ? "text-sm md:text-[15px]" : "text-[13px]"
            )}>
              {property.description}
            </p>
          </div>
        )}

        {/* Endereço Mais Completo */}
        <div className="flex items-start gap-2.5 rounded-2xl bg-zinc-50 border border-zinc-200/70 p-3 transition-colors group-hover:border-emerald-200/80 group-hover:bg-emerald-50/30">
          <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-700" />
          </div>
          <div className="flex flex-col leading-snug min-w-0 flex-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
              Endereço / Localização
            </span>
            <span className="text-xs font-bold text-zinc-800 line-clamp-2">
              {completeAddress}
            </span>
          </div>
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-2 pt-3 border-t border-zinc-100">
          <div className="flex-1 flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Maximize2 className="w-3.5 h-3.5 text-emerald-700" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Área</span>
              <span className="text-xs font-black text-zinc-800">{areaLabel}</span>
            </div>
          </div>
          {(property.bedrooms ?? 0) > 0 && (
            <div className="flex-1 flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <BedDouble className="w-3.5 h-3.5 text-emerald-700" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Quartos</span>
                <span className="text-xs font-black text-zinc-800">{property.bedrooms}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="px-5 pb-5 pt-1">
        <Button
          onClick={goToDetail}
          className="w-full relative overflow-hidden bg-zinc-900 hover:bg-zinc-900 text-white rounded-2xl font-black text-sm h-12 group/btn shadow-lg shadow-zinc-900/20 transition-all"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-green-500 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
          <span className="relative flex items-center justify-center gap-2 tracking-wider">
            TENHO INTERESSE
            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
          </span>
        </Button>
      </CardFooter>
      </div>
    </Card>
  );
};
