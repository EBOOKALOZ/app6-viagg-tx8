import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { MapPin, Wifi, WifiOff, Clock } from 'lucide-react';

interface RIDVHeaderProps {
  avatarUrl?: string;
  userName?: string;
  city?: string;
  state?: string;
  isOnline?: boolean;
  profileType?: 'motoboy' | 'mototaxi' | 'driver';
  /** ISO string da criação do usuário para calcular tempo na plataforma */
  memberSince?: string;
}

const PROFILE_META: Record<string, { label: string; emoji: string; accentClass: string; borderClass: string }> = {
  motoboy:  { label: 'Motoboy',    emoji: '🛵', accentClass: 'bg-orange-500/20 text-orange-400', borderClass: 'ring-orange-500/40' },
  mototaxi: { label: 'Moto-Táxi', emoji: '🏍️', accentClass: 'bg-yellow-400/20 text-yellow-300', borderClass: 'ring-yellow-400/40' },
  driver:   { label: 'Motorista',  emoji: '🚗', accentClass: 'bg-blue-500/20 text-blue-400',   borderClass: 'ring-blue-500/40' },
};

function calcMemberSince(isoDate?: string): string {
  if (!isoDate) return '—';
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days < 1) return 'Hoje';
  if (days === 1) return '1 dia';
  if (days < 30) return `${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'ano' : 'anos'}`;
}

export function RIDVHeader({
  avatarUrl,
  userName = 'Parceiro',
  city = '',
  state = '',
  isOnline = false,
  profileType = 'motoboy',
  memberSince,
}: RIDVHeaderProps) {
  const meta = PROFILE_META[profileType] ?? PROFILE_META.motoboy;
  const memberLabel = calcMemberSince(memberSince);
  const location = [city, state].filter(Boolean).join(', ');

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #1B1F24 0%, #0D0F12 100%)',
        border: '1px solid rgba(42,48,56,0.80)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{ background: 'linear-gradient(90deg, transparent, #FF6A00, transparent)' }}
      />

      <div className="relative z-10 p-4 flex items-center gap-4">
        {/* Avatar */}
        <div className={cn('relative shrink-0 w-14 h-14 rounded-full ring-2', meta.borderClass)}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center text-2xl select-none">
              {meta.emoji}
            </div>
          )}
          {/* Online indicator */}
          <span
            className={cn(
              'absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-[#0D0F12]',
              isOnline ? 'bg-emerald-400' : 'bg-zinc-500'
            )}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black text-white leading-none truncate">{userName}</h2>
            <span className={cn('text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md', meta.accentClass)}>
              {meta.label}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {location && (
              <div className="flex items-center gap-1 text-[10px] text-[#A7B0BE]/60 font-medium">
                <MapPin className="h-3 w-3 shrink-0 text-orange-400/70" />
                <span>{location}</span>
              </div>
            )}
            <div className={cn('flex items-center gap-1 text-[10px] font-bold', isOnline ? 'text-emerald-400' : 'text-zinc-500')}>
              {isOnline ? <Wifi className="h-3 w-3 shrink-0" /> : <WifiOff className="h-3 w-3 shrink-0" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Member Since */}
        <div className="shrink-0 text-right">
          <div className="flex items-center gap-1 text-[9px] text-[#A7B0BE]/40 font-medium justify-end">
            <Clock className="h-3 w-3" />
            <span>na plataforma</span>
          </div>
          <p className="text-sm font-black text-[#A7B0BE]/70 mt-0.5">{memberLabel}</p>
        </div>
      </div>
    </div>
  );
}
