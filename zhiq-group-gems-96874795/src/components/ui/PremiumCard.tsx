import React from 'react';
import { Heart, MapPin } from 'lucide-react';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type PremiumBadgeVariant = 'verified' | 'featured' | 'new' | 'premium' | 'sponsored' | 'free' | 'hot';

export interface PremiumBadge {
  label: string;
  variant: PremiumBadgeVariant;
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
  onPrimaryAction?: (e: React.MouseEvent) => void;
  className?: string;
  aspectRatio?: 'video' | 'square' | 'portrait';
  imageObjectFit?: 'cover' | 'contain';
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
  onPrimaryAction,
  className,
  aspectRatio = 'video',
  imageObjectFit = 'cover',
  merchant,
}) => {
  const getBadgeStyle = (variant: PremiumBadgeVariant) => {
    switch (variant) {
      case 'verified': return 'bg-green-500/90 text-white backdrop-blur-md border-white/20';
      case 'featured': return 'bg-[#F5E62B]/90 text-zinc-900 backdrop-blur-md border-white/20';
      case 'new': return 'bg-blue-500/90 text-white backdrop-blur-md border-white/20';
      case 'premium': return 'bg-zinc-900/90 text-amber-400 backdrop-blur-md border-white/20';
      case 'sponsored': return 'bg-zinc-100/90 text-zinc-600 backdrop-blur-md border-white/20';
      case 'free': return 'bg-orange-500/90 text-white backdrop-blur-md border-white/20';
      case 'hot': return 'bg-red-500/90 text-white backdrop-blur-md border-white/20';
      default: return 'bg-zinc-800/90 text-white backdrop-blur-md';
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
        "group relative flex flex-col w-full bg-white rounded-3xl overflow-hidden cursor-pointer",
        "border border-zinc-100/50",
        "shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)]",
        "transition-all duration-500 ease-out",
        className
      )}
    >
      {/* ─── IMAGE HEADER ─── */}
      <div className={cn("relative w-full overflow-hidden bg-zinc-100", aspectClass)}>
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
          <div className="w-full h-full flex items-center justify-center text-zinc-300">
            {fallbackIcon || <div className="w-12 h-12 rounded-xl bg-zinc-200" />}
          </div>
        )}

        {/* Top Badges (Left) */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-10">
          {category && (
            <Badge className={cn("rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-sm border-none", categoryColor)}>
              {category}
            </Badge>
          )}
          {badges.map((badge, idx) => (
            <Badge key={idx} className={cn("rounded-lg px-2 py-1 text-[10px] font-bold shadow-sm border-none", getBadgeStyle(badge.variant))}>
              {badge.label}
            </Badge>
          ))}
        </div>

        {/* Favorite Button (Right) */}
        {onFavorite && (
          <button 
            onClick={handleFavoriteClick}
            className="absolute top-3 right-3 z-10 p-2.5 rounded-full bg-white/20 hover:bg-white/40 backdrop-blur-md transition-colors"
          >
            <Heart 
              className={cn("w-5 h-5 transition-all duration-300", isFavorited ? "fill-red-500 text-red-500 scale-110" : "text-white")} 
            />
          </button>
        )}

        {/* Gradient Overlay for bottom contrast */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      </div>

      {/* ─── CONTENT BODY ─── */}
      <div className="flex flex-col flex-1 p-5 lg:p-6 space-y-4">
        
        <div className="space-y-1.5">
          <h3 className="text-lg lg:text-xl font-black text-zinc-900 leading-tight line-clamp-2 group-hover:text-sky-700 transition-colors">
            {title}
          </h3>
          
          {location && (
            <div className="flex items-center gap-1.5 text-zinc-500">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-medium truncate">{location}</span>
            </div>
          )}
        </div>

        {/* Features Row */}
        {features.length > 0 && (
          <div className="flex items-center flex-wrap gap-3 py-2">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-zinc-600 bg-zinc-50 px-2.5 py-1 rounded-lg">
                <span className="text-sky-600 w-3.5 h-3.5 flex items-center justify-center">{feature.icon}</span>
                <span className="text-xs font-semibold">{feature.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spacer to push footer to bottom */}
        <div className="flex-1" />

        {/* Divider */}
        <div className="h-px w-full bg-zinc-100" />

        {/* Merchant Info */}
        {merchant && (
          <div 
            className={cn("flex items-center gap-2.5 pt-1", merchant.onClick && "cursor-pointer hover:opacity-80 transition-opacity")}
            onClick={(e) => {
              if (merchant.onClick) {
                e.preventDefault();
                e.stopPropagation();
                merchant.onClick(e);
              }
            }}
          >
            <div className="w-7 h-7 rounded-full overflow-hidden border border-zinc-200 bg-zinc-50 shrink-0 flex items-center justify-center">
              {merchant.avatarUrl ? (
                <img src={merchant.avatarUrl} className="w-full h-full object-cover" alt={merchant.name} />
              ) : (
                <span className="text-[10px] font-bold text-zinc-400">{merchant.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <span className="text-xs font-bold text-zinc-700 leading-none truncate">{merchant.name}</span>
              {merchant.isOfficial && <span className="text-[9px] font-black text-[#FF6A00] uppercase tracking-wider mt-0.5">Loja Oficial</span>}
            </div>
          </div>
        )}

        {/* Footer: Price & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pt-1">
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
            {oldPrice ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 line-through font-medium">
                  {pricePrefix} {formatCurrencyBRL(oldPrice).replace('R$', '').trim()}
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-500/30 text-green-600 bg-green-500/10">
                  -{Math.round(((oldPrice - (price || 0)) / oldPrice) * 100)}%
                </Badge>
              </div>
            ) : null}
            
            {price !== undefined && price !== null ? (
              <div className="flex items-baseline gap-1 text-sky-700">
                <span className="text-xs font-bold">{pricePrefix}</span>
                <span className="text-xl lg:text-2xl font-black tracking-tight leading-none">
                  {formatCurrencyBRL(price).replace('R$', '').trim()}
                </span>
                {priceSuffix && <span className="text-xs font-semibold text-zinc-500">{priceSuffix}</span>}
              </div>
            ) : (
              <span className="text-sm font-bold text-zinc-500 uppercase">Preço sob consulta</span>
            )}
          </div>

          <Button 
            onClick={handleActionClick}
            className="w-full sm:w-auto shrink-0 bg-[#68c7f2] hover:opacity-90 text-zinc-900 rounded-xl shadow-[0_4px_14px_0_rgba(104,199,242,0.39)] hover:shadow-[0_6px_20px_rgba(104,199,242,0.23)] hover:-translate-y-0.5 transition-all duration-200 px-5"
          >
            <span className="font-bold text-xs uppercase tracking-wider">{primaryActionLabel}</span>
          </Button>
        </div>

      </div>
    </div>
  );
};
