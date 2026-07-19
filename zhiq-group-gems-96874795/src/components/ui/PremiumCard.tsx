import React from 'react';
import { Heart, MapPin } from 'lucide-react';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type PremiumBadgeVariant = 'verified' | 'featured' | 'new' | 'premium' | 'sponsored' | 'free' | 'hot';

export interface PremiumBadge {
  label: string;
  variant: PremiumBadgeVariant;
  overrideClasses?: string;
}

export interface PremiumFeature {
  icon: React.ReactNode;
  label: string | number;
}

export interface PremiumCardProps {
  imageUrl?: string | null;
  fallbackIcon?: React.ReactNode;
  category?: string;
  categoryColor?: string; // Tailwind class, e.g. 'bg-blue-500'
  title: string;
  description?: string | null;
  location?: string;
  features?: PremiumFeature[];
  price?: number | null;
  oldPrice?: number | null;
  pricePrefix?: string;
  priceSuffix?: string;
  badges?: PremiumBadge[];
  isFavorited?: boolean;
  onFavorite?: (e: React.MouseEvent) => void;
  onClick?: (e?: React.MouseEvent) => void;
  primaryActionLabel?: string;
  primaryActionIcon?: React.ReactNode;
  primaryActionClass?: string;
  onPrimaryAction?: (e: React.MouseEvent) => void;
  className?: string;
  aspectRatio?: 'video' | 'square' | 'portrait';
  imageObjectFit?: 'cover' | 'contain';
  customOverlays?: React.ReactNode;
  merchant?: {
    name: string;
    avatarUrl?: string | null;
    isOfficial?: boolean;
    onClick?: (e: React.MouseEvent) => void;
  };
}

export const PremiumCard: React.FC<PremiumCardProps> = ({
  imageUrl,
  fallbackIcon,
  category,
  categoryColor = 'bg-sky-500',
  title,
  description,
  location,
  features = [],
  price,
  oldPrice,
  pricePrefix = 'R$',
  priceSuffix,
  badges = [],
  isFavorited = false,
  onFavorite,
  onClick,
  primaryActionLabel = 'Tenho Interesse',
  primaryActionIcon,
  primaryActionClass,
  onPrimaryAction,
  className,
  aspectRatio = 'video',
  imageObjectFit = 'cover',
  customOverlays,
  merchant,
}) => {
  const getBadgeStyle = (variant: PremiumBadgeVariant) => {
    switch (variant) {
      case 'verified': return 'bg-emerald-500 text-white backdrop-blur-md border-emerald-400/30';
      case 'featured': return 'bg-[#F5E62B] text-zinc-900 font-black backdrop-blur-md border-amber-300/30';
      case 'new': return 'bg-blue-500 text-white backdrop-blur-md border-blue-400/30';
      case 'premium': return 'bg-zinc-900 text-amber-400 backdrop-blur-md border-zinc-700';
      case 'sponsored': return 'bg-zinc-100 text-zinc-600 backdrop-blur-md border-zinc-200';
      case 'free': return 'bg-[#FF6A00] text-white backdrop-blur-md border-orange-400/30';
      case 'hot': return 'bg-red-500 text-white backdrop-blur-md border-red-400/30';
      default: return 'bg-zinc-800 text-white backdrop-blur-md';
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick) onClick(e);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPrimaryAction) {
      onPrimaryAction(e);
    } else if (onClick) {
      onClick(e);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFavorite) onFavorite(e);
  };

  const aspectClass = {
    'video': 'aspect-video',
    'square': 'aspect-square',
    'portrait': 'aspect-[3/4]'
  }[aspectRatio];

  return (
    <div 
      onClick={handleCardClick}
      className={cn(
        "group relative flex flex-col w-full bg-white rounded-[24px] overflow-hidden cursor-pointer",
        "border border-zinc-100/80 hover:border-zinc-200/90",
        "shadow-[0_4px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.12)]",
        "transition-all duration-300 ease-out",
        className
      )}
    >
      {/* ─── 1. IMAGEM ─── */}
      <div className={cn("relative w-full overflow-hidden bg-zinc-50 shrink-0", aspectClass)}>
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={title}
            loading="lazy"
            className={cn(
              "w-full h-full transition-transform duration-700 ease-out group-hover:scale-105",
              imageObjectFit === 'contain' ? 'object-contain bg-zinc-900' : 'object-cover'
            )}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300 bg-gradient-to-br from-zinc-50 to-zinc-100">
            {fallbackIcon || <div className="w-12 h-12 rounded-2xl bg-zinc-200/80" />}
          </div>
        )}

        {/* Top Badges (Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10 pointer-events-none">
          {badges.map((badge, idx) => (
            <Badge 
              key={idx} 
              className={cn(
                "rounded-lg px-2.5 py-1 text-[10px] font-bold shadow-sm border",
                badge.overrideClasses || getBadgeStyle(badge.variant)
              )}
            >
              {badge.label}
            </Badge>
          ))}
        </div>

        {/* Favorite Button (Right) */}
        {onFavorite && (
          <button 
            onClick={handleFavoriteClick}
            className="absolute top-3 right-3 z-10 p-2.5 rounded-full bg-white/80 hover:bg-white text-zinc-700 hover:text-red-500 shadow-sm backdrop-blur-md transition-all duration-200"
          >
            <Heart 
              className={cn("w-4 h-4 transition-all duration-300", isFavorited ? "fill-red-500 text-red-500 scale-110" : "text-zinc-600")} 
            />
          </button>
        )}

        {/* Custom Overlays (e.g., Timer / Auction countdown) */}
        {customOverlays}

        {/* Subtle Bottom Gradient */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
      </div>

      {/* ─── CONTENT BODY (Strict Hierarchy) ─── */}
      <div className="flex flex-col flex-1 p-5 sm:p-6 space-y-3">
        
        {/* ─── 2. NOME DO ESTABELECIMENTO & TÍTULO ─── */}
        <div className="space-y-1.5">
          {merchant && (
            <div 
              className={cn("flex items-center gap-2 mb-1", merchant.onClick && "cursor-pointer hover:opacity-80 transition-opacity")}
              onClick={(e) => {
                if (merchant.onClick) {
                  e.preventDefault();
                  e.stopPropagation();
                  merchant.onClick(e);
                }
              }}
            >
              <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-200 bg-zinc-100 shrink-0 flex items-center justify-center">
                {merchant.avatarUrl ? (
                  <img src={merchant.avatarUrl} className="w-full h-full object-cover" alt={merchant.name} />
                ) : (
                  <span className="text-[10px] font-bold text-zinc-500">{merchant.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex items-center gap-1.5 flex-1">
                <span className="text-xs font-bold text-zinc-700 truncate">{merchant.name}</span>
                {merchant.isOfficial && (
                  <span className="text-[9px] font-black bg-[#FF6A00]/10 text-[#FF6A00] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                    Oficial
                  </span>
                )}
              </div>
            </div>
          )}

          <h3 className="text-base sm:text-lg font-black text-zinc-900 leading-snug line-clamp-2 group-hover:text-sky-700 transition-colors">
            {title}
          </h3>

          {description && (
            <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* ─── 3. PREÇO ─── */}
        <div className="pt-0.5">
          {oldPrice ? (
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs text-zinc-400 line-through font-medium">
                {pricePrefix} {formatCurrencyBRL(oldPrice).replace('R$', '').trim()}
              </span>
              <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0.5 border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                -{Math.round(((oldPrice - (price || 0)) / oldPrice) * 100)}%
              </Badge>
            </div>
          ) : null}
          
          {price !== undefined && price !== null ? (
            (() => {
              const cleanPrice = formatCurrencyBRL(price).replace('R$', '').trim();
              const pLen = cleanPrice.length;
              const pSizeClass = pLen >= 14
                ? "text-base sm:text-lg"
                : pLen >= 11
                  ? "text-lg sm:text-xl"
                  : "text-xl sm:text-2xl";
              return (
                <div className="flex items-baseline gap-1 text-[#FF6A00] min-w-0 flex-wrap">
                  <span className="text-xs font-bold shrink-0">{pricePrefix}</span>
                  <span className={cn("font-black tracking-tight leading-none break-words", pSizeClass)}>
                    {cleanPrice}
                  </span>
                  {priceSuffix && <span className="text-xs font-semibold text-zinc-500 shrink-0">{priceSuffix}</span>}
                </div>
              );
            })()
          ) : (
            <span className="text-sm font-bold text-zinc-500 uppercase tracking-wide">Preço sob consulta</span>
          )}
        </div>

        {/* ─── 4. CATEGORIA ─── */}
        {category && (
          <div className="pt-1">
            <span className={cn(
              "inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm",
              categoryColor
            )}>
              {category}
            </span>
          </div>
        )}

        {/* ─── 5. LOCALIZAÇÃO ─── */}
        {location && (
          <div className="flex items-center gap-1.5 text-zinc-500 pt-0.5">
            <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="text-xs font-medium truncate">{location}</span>
          </div>
        )}

        {/* ─── 6. SELOS / ESPECIFICAÇÕES ─── */}
        {features.length > 0 && (
          <div className="flex items-center flex-wrap gap-2 pt-1.5">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-zinc-700 bg-zinc-50 border border-zinc-100 px-2.5 py-1 rounded-xl">
                <span className="text-sky-600 w-3.5 h-3.5 flex items-center justify-center shrink-0">{feature.icon}</span>
                <span className="text-xs font-semibold truncate max-w-[140px]">{feature.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spacer to push buttons cleanly to bottom */}
        <div className="flex-1" />

        {/* ─── 7. BOTÕES ─── */}
        <div className="pt-3 border-t border-zinc-100/80 mt-auto">
          <Button 
            onClick={handleActionClick}
            className={cn(
              "w-full h-11 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-sm flex items-center justify-center",
              primaryActionClass || "bg-[#68c7f2] hover:opacity-90 text-zinc-900 shadow-[0_4px_14px_rgba(104,199,242,0.3)] hover:shadow-[0_6px_20px_rgba(104,199,242,0.4)] hover:-translate-y-0.5"
            )}
          >
            {primaryActionIcon}
            <span>{primaryActionLabel}</span>
          </Button>
        </div>

      </div>
    </div>
  );
};

