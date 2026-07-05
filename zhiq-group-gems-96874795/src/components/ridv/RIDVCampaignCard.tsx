import { cn } from '@/lib/utils';
import { Share2, Eye, Heart, MapPin, Calendar, Star, Zap } from 'lucide-react';

export type RIDVCategory =
  | 'restaurant'
  | 'hotel'
  | 'service'
  | 'product'
  | 'real-estate'
  | 'vehicle'
  | 'company';

export type RIDVPriority = 'normal' | 'high' | 'featured';

export interface RIDVCampaign {
  id: string;
  company_name: string;
  product_title: string;
  description?: string;
  category: RIDVCategory;
  city: string;
  state: string;
  image_url?: string;
  valid_until?: string;
  priority: RIDVPriority;
  /** Futura integração IA RIDV */
  ridv_score?: number;
  target_reach?: number;
}

const CATEGORY_META: Record<RIDVCategory, { emoji: string; label: string; glowHex: string }> = {
  restaurant:  { emoji: '🍽️', label: 'Restaurante', glowHex: '#f97316' },
  hotel:       { emoji: '🏨', label: 'Hotel',        glowHex: '#6366f1' },
  service:     { emoji: '🔧', label: 'Serviço',      glowHex: '#0ea5e9' },
  product:     { emoji: '📦', label: 'Produto',       glowHex: '#10b981' },
  'real-estate': { emoji: '🏠', label: 'Imóvel',    glowHex: '#8b5cf6' },
  vehicle:     { emoji: '🚗', label: 'Veículo',      glowHex: '#f59e0b' },
  company:     { emoji: '🏢', label: 'Empresa',      glowHex: '#ec4899' },
};

const PRIORITY_META: Record<RIDVPriority, { label: string; cls: string; icon: typeof Star }> = {
  normal:   { label: 'Normal',   cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/20', icon: Star },
  high:     { label: 'Alta',     cls: 'bg-amber-500/20 text-amber-400 border-amber-500/20', icon: Zap },
  featured: { label: 'Destaque', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Star },
};

function calcValidity(isoDate?: string): { label: string; urgent: boolean } {
  if (!isoDate) return { label: '', urgent: false };
  const diff = new Date(isoDate).getTime() - Date.now();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return { label: 'Hoje!', urgent: true };
  if (days === 1) return { label: 'Amanhã', urgent: true };
  return { label: `Expira em ${days}d`, urgent: days <= 3 };
}

interface RIDVCampaignCardProps {
  campaign: RIDVCampaign;
  onShare?: (id: string) => void;
  onView?: (id: string) => void;
  onFavorite?: (id: string) => void;
  isFavorited?: boolean;
  compact?: boolean;
}

export function RIDVCampaignCard({
  campaign,
  onShare,
  onView,
  onFavorite,
  isFavorited = false,
  compact = false,
}: RIDVCampaignCardProps) {
  const catMeta = CATEGORY_META[campaign.category] ?? CATEGORY_META.company;
  const priMeta = PRIORITY_META[campaign.priority] ?? PRIORITY_META.normal;
  const PriIcon = priMeta.icon;
  const validity = calcValidity(campaign.valid_until);

  return (
    <div
      className="relative rounded-2xl overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      style={{
        background: 'linear-gradient(145deg, #1B1F24 0%, #0D0F12 100%)',
        border: campaign.priority === 'featured'
          ? '1px solid rgba(255,106,0,0.40)'
          : '1px solid rgba(42,48,56,0.80)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${catMeta.glowHex}, transparent)` }}
      />

      {/* Image / Emoji fallback */}
      {!compact && (
        <div className="relative w-full aspect-video overflow-hidden bg-zinc-900/60">
          {campaign.image_url ? (
            <img
              src={campaign.image_url}
              alt={campaign.product_title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-5xl"
              style={{ background: `radial-gradient(ellipse at 50% 50%, ${catMeta.glowHex}18, transparent 70%)` }}
            >
              {catMeta.emoji}
            </div>
          )}
          {/* Priority badge overlay */}
          <div className="absolute top-2 right-2">
            <span className={cn('inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border', priMeta.cls)}>
              <PriIcon className="h-2.5 w-2.5" />
              {priMeta.label}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3.5 space-y-2">
        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ background: `${catMeta.glowHex}18`, color: catMeta.glowHex, border: `1px solid ${catMeta.glowHex}28` }}
          >
            <span>{catMeta.emoji}</span>
            {catMeta.label}
          </span>
          {compact && (
            <span className={cn('inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border', priMeta.cls)}>
              <PriIcon className="h-2.5 w-2.5" />
              {priMeta.label}
            </span>
          )}
          {validity.label && (
            <span className={cn(
              'inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md',
              validity.urgent
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                : 'bg-zinc-700/50 text-zinc-400 border border-zinc-700/50'
            )}>
              <Calendar className="h-2.5 w-2.5" />
              {validity.label}
            </span>
          )}
        </div>

        {/* Company + city */}
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold text-[#A7B0BE]/55 uppercase tracking-wider truncate">
              {campaign.company_name}
            </p>
            <span className="text-[10px] text-[#A7B0BE]/30">·</span>
            <div className="flex items-center gap-0.5 text-[10px] text-[#A7B0BE]/40 shrink-0">
              <MapPin className="h-2.5 w-2.5" />
              <span>{campaign.city}</span>
            </div>
          </div>
          <h3 className="text-sm font-black text-white leading-tight mt-0.5 line-clamp-1">
            {campaign.product_title}
          </h3>
          {!compact && campaign.description && (
            <p className="text-[11px] text-[#A7B0BE]/50 mt-1 line-clamp-2 leading-relaxed">
              {campaign.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onShare?.(campaign.id)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-2 rounded-xl transition-all active:scale-95 hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, #FF6A00, #FF9500)',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(255,106,0,0.35)',
            }}
          >
            <Share2 className="h-3 w-3" />
            Compartilhar
          </button>
          <button
            onClick={() => onView?.(campaign.id)}
            className="inline-flex items-center justify-center gap-1 text-[10px] font-bold px-3 py-2 rounded-xl transition-all active:scale-95 hover:scale-[1.02]"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#A7B0BE', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Eye className="h-3 w-3" />
            Ver
          </button>
          <button
            onClick={() => onFavorite?.(campaign.id)}
            className={cn(
              'inline-flex items-center justify-center p-2 rounded-xl transition-all active:scale-95 hover:scale-[1.02]',
              isFavorited ? 'text-rose-400' : 'text-[#A7B0BE]/40 hover:text-rose-400/70'
            )}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Heart className={cn('h-3.5 w-3.5', isFavorited && 'fill-current')} />
          </button>
        </div>
      </div>
    </div>
  );
}
