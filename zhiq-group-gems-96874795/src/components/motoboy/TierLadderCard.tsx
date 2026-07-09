import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, Check, Lock, Crown, Trophy, Medal, Sparkles, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export type TierName = 'Inicial' | 'Bronze' | 'Prata' | 'Ouro' | 'Elite' | 'VIP';

export interface TierDef {
  name: TierName;
  rate: number;          // % de comissão TX8
  groupsRequired: number; // # mínimo de grupos válidos
  icon: typeof Award;
  /** Classes Tailwind para o gradient do badge do tier (quando atingido). */
  gradient: string;
  /** Cor da borda quando ativo / atingido. */
  ring: string;
  /** Cor do texto do nome / %. */
  accent: string;
}

export const TIER_LADDER: TierDef[] = [
  { name: 'Inicial', rate: 25, groupsRequired: 0, icon: Award,  gradient: 'from-zinc-500 to-zinc-700',         ring: 'ring-zinc-400/60',    accent: 'text-zinc-700' },
  { name: 'Bronze',  rate: 20, groupsRequired: 1, icon: Medal,  gradient: 'from-amber-700 to-amber-900',       ring: 'ring-amber-600/60',   accent: 'text-amber-700' },
  { name: 'Prata',   rate: 16, groupsRequired: 2, icon: Medal,  gradient: 'from-slate-300 to-slate-500',       ring: 'ring-slate-400/60',   accent: 'text-slate-600' },
  { name: 'Ouro',    rate: 12, groupsRequired: 3, icon: Trophy, gradient: 'from-yellow-400 to-yellow-600',     ring: 'ring-yellow-400/60',  accent: 'text-yellow-600' },
  { name: 'Elite',   rate: 9,  groupsRequired: 4, icon: Sparkles, gradient: 'from-sky-400 to-blue-600',         ring: 'ring-sky-400/60',     accent: 'text-blue-600' },
  { name: 'VIP',     rate: 6,  groupsRequired: 5, icon: Crown,  gradient: 'from-fuchsia-500 via-purple-500 to-emerald-500', ring: 'ring-purple-400/60', accent: 'text-purple-600' },
];

export function getCurrentTier(validGroups: number): TierDef {
  // Maior tier cujo groupsRequired ≤ validGroups
  let current = TIER_LADDER[0];
  for (const t of TIER_LADDER) {
    if (validGroups >= t.groupsRequired) current = t;
  }
  return current;
}

export function getNextTier(validGroups: number): TierDef | null {
  return TIER_LADDER.find(t => t.groupsRequired > validGroups) ?? null;
}

interface TierLadderCardProps {
  validGroups: number;
  avatarUrl?: string;
  userName?: string;
}

/**
 * Escada visual dos 6 tiers de comissão (Inicial → VIP).
 * Mostra onde o motoboy está, quanto falta pro próximo, e o tier final.
 */
export function TierLadderCard({ validGroups, avatarUrl, userName }: TierLadderCardProps) {
  const { user, avatarUrl: authAvatarUrl, displayName } = useAuth();
  const [dbAvatarUrl, setDbAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (avatarUrl || authAvatarUrl) return;
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setDbAvatarUrl(data.avatar_url);
      });
  }, [user?.id, avatarUrl, authAvatarUrl]);

  const current = getCurrentTier(validGroups);
  const next = getNextTier(validGroups);
  const groupsToNext = next ? next.groupsRequired - validGroups : 0;

  // Foto do avatar do motoboy logado (com fallback profissional)
  const motoboyPhoto = avatarUrl || authAvatarUrl || dbAvatarUrl || 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=150&auto=format&fit=crop&q=80';
  const motoboyName = userName || displayName || 'Motoboy';
  const motoboyInitials = motoboyName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="border border-black/15 bg-[#F5E62B] text-slate-950 shadow-2xl overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-black flex items-center gap-2 text-slate-950">
              <Trophy className="h-5 w-5 text-slate-950" />
              Sua Escada de Tiers
            </CardTitle>
            <p className="text-[11px] font-semibold text-slate-900/90 mt-1">
              Cada grupo válido te leva pro próximo nível e reduz sua taxa.
            </p>
          </div>
          <div className="shrink-0 px-3 py-1.5 rounded-xl bg-[#00a300] text-center shadow-lg border border-black/20">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#F5E62B]">Você está em</p>
            <p className="text-sm font-black text-white">{current.name}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {TIER_LADDER.map((tier, idx) => {
          const achieved = validGroups >= tier.groupsRequired;
          const isCurrent = current.name === tier.name;
          const isNext = next?.name === tier.name;
          const Icon = tier.icon;

          return (
            <div
              key={tier.name}
              className={cn(
                'relative flex items-center gap-3 rounded-xl p-3 transition-all border shadow-md',
                // ATUAL: fundo verde exato #00a300 com contraste premium
                isCurrent && 'bg-[#00a300] text-white border-2 border-slate-950 shadow-xl scale-[1.02] ring-2 ring-black/20',
                // CONQUISTADOS (abaixo do atual)
                !isCurrent && achieved && 'bg-[#00a300]/90 text-white border-black/15',
                // PRÓXIMO: card branco com destaque amarelo #F5E62B pulsante
                isNext && !isCurrent && 'bg-white text-slate-950 border-2 border-[#00a300] shadow-lg animate-pulse',
                // BLOQUEADOS: card escuro translúcido elegante
                !achieved && !isNext && 'bg-slate-950/75 text-white/90 border-slate-900/40'
              )}
            >
              {/* Avatar do Motoboy na Escada de Tiers */}
              <div className={cn(
                'relative shrink-0 w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center shadow-md ring-2 overflow-visible',
                tier.gradient,
                isCurrent && 'ring-[#F5E62B] shadow-lg shadow-[#F5E62B]/40',
                !isCurrent && achieved && 'ring-[#F5E62B]/60',
                !achieved && 'grayscale ring-white/10'
              )}>
                <Avatar className="h-full w-full rounded-full border border-white/20 shadow-inner">
                  <AvatarImage
                    src={motoboyPhoto}
                    alt={motoboyName}
                    className="object-cover"
                  />
                  <AvatarFallback className={cn('bg-gradient-to-br text-white font-black text-xs flex items-center justify-center', tier.gradient)}>
                    {motoboyInitials}
                  </AvatarFallback>
                </Avatar>

                {achieved && (
                  <span className="absolute -top-1 -right-1 bg-[#F5E62B] text-slate-950 text-[8px] font-black rounded-full w-5 h-5 flex items-center justify-center shadow-lg ring-2 ring-[#00a300] z-10">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
                {!achieved && !isNext && (
                  <span className="absolute -bottom-1 -right-1 bg-slate-700 text-slate-300 rounded-full w-5 h-5 flex items-center justify-center shadow ring-2 ring-slate-900 z-10">
                    <Lock className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-sm">{tier.name}</h4>
                  {isCurrent && (
                    <span className="text-[9px] uppercase tracking-widest font-bold bg-[#F5E62B] text-slate-950 px-1.5 py-0.5 rounded shadow-sm">
                      Você está aqui
                    </span>
                  )}
                  {isNext && (
                    <span className="text-[9px] uppercase tracking-widest font-bold bg-[#F5E62B] text-slate-950 px-1.5 py-0.5 rounded">
                      Próximo
                    </span>
                  )}
                </div>
                <p className={cn(
                  'text-[11px] leading-tight mt-0.5',
                  isNext && !isCurrent ? 'text-slate-700 font-medium' : 'text-slate-100 font-medium'
                )}>
                  {tier.groupsRequired === 0
                    ? 'Sem grupos vinculados'
                    : `${tier.groupsRequired}${tier.name === 'VIP' ? '+' : ''} grupo${tier.groupsRequired > 1 ? 's' : ''} válido${tier.groupsRequired > 1 ? 's' : ''}`}
                </p>
              </div>

              {/* % de comissão */}
              <div className="text-right shrink-0">
                <p className={cn(
                  'text-2xl font-black leading-none',
                  isCurrent && 'text-[#F5E62B]',
                  !isCurrent && achieved && 'text-[#F5E62B]',
                  isNext && !isCurrent && 'text-slate-950',
                  !achieved && !isNext && 'text-slate-400'
                )}>
                  {tier.rate}%
                </p>
                <p className={cn(
                  'text-[9px] uppercase tracking-wider mt-0.5',
                  achieved ? 'text-[#F5E62B]/90 font-bold' : isNext && !isCurrent ? 'text-slate-600 font-bold' : 'text-slate-400'
                )}>
                  taxa TX8
                </p>
              </div>

              {/* Conector entre tiers (linha vertical) */}
              {idx < TIER_LADDER.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-9 -bottom-2 w-0.5 h-2',
                    achieved && validGroups >= TIER_LADDER[idx + 1].groupsRequired
                      ? 'bg-[#F5E62B]'
                      : achieved
                        ? 'bg-[#F5E62B]/50'
                        : 'bg-slate-700/60'
                  )}
                />
              )}
            </div>
          );
        })}

        {/* Rodapé com call to action */}
        {next && (
          <div className="mt-3 p-3 rounded-xl bg-[#00a300] text-white border border-black/20 flex items-center gap-2 shadow-lg">
            <ChevronRight className="h-4 w-4 text-[#F5E62B] shrink-0" />
            <p className="text-xs text-white font-medium">
              Falta{groupsToNext > 1 ? 'm' : ''}{' '}
              <span className="font-black text-[#F5E62B]">{groupsToNext} grupo{groupsToNext > 1 ? 's' : ''}</span>{' '}
              válido{groupsToNext > 1 ? 's' : ''} pra subir pra{' '}
              <span className="font-black text-white">{next.name}</span>{' '}
              <span className="text-[#F5E62B]">({next.rate}%)</span>.
            </p>
          </div>
        )}
        {!next && (
          <div className="mt-3 p-3 rounded-xl bg-[#00a300] text-white border border-black/20 flex items-center gap-2 shadow-lg">
            <Crown className="h-4 w-4 text-[#F5E62B] shrink-0" />
            <p className="text-xs text-white font-medium">
              Você atingiu o topo: <span className="font-black text-white">VIP</span> — a menor taxa da plataforma.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
