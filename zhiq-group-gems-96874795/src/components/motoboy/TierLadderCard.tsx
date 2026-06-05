import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Award, Check, Lock, Crown, Trophy, Medal, Sparkles, ChevronRight } from 'lucide-react';
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
}

/**
 * Escada visual dos 6 tiers de comissão (Inicial → VIP).
 * Mostra onde o motoboy está, quanto falta pro próximo, e o tier final.
 */
export function TierLadderCard({ validGroups }: TierLadderCardProps) {
  const current = getCurrentTier(validGroups);
  const next = getNextTier(validGroups);
  const groupsToNext = next ? next.groupsRequired - validGroups : 0;

  return (
    <Card className="border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              Sua Escada de Tiers
            </CardTitle>
            <p className="text-[11px] text-slate-400 mt-1">
              Cada grupo válido te leva pro próximo nível e reduz sua taxa.
            </p>
          </div>
          <div className={cn(
            'shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-br text-center shadow-lg',
            current.gradient
          )}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/80">Você está em</p>
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
                'relative flex items-center gap-3 rounded-xl p-3 transition-all border',
                // ATUAL: verde forte com glow
                isCurrent && 'bg-gradient-to-r from-emerald-500/30 to-emerald-600/20 border-emerald-400/60 shadow-xl shadow-emerald-500/30 scale-[1.02] ring-2 ring-emerald-400/40',
                // CONQUISTADOS (abaixo do atual): verde mais suave
                !isCurrent && achieved && 'bg-emerald-500/15 border-emerald-500/30',
                // BLOQUEADOS: cinza escuro
                !achieved && !isNext && 'bg-black/20 border-white/5 opacity-50',
                // PRÓXIMO: âmbar pulsante
                isNext && !isCurrent && 'bg-amber-500/10 border-amber-400/40 animate-pulse'
              )}
            >
              {/* Medal/Icon */}
              <div className={cn(
                'relative shrink-0 w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center shadow-md ring-2',
                tier.gradient,
                isCurrent && 'ring-emerald-300 shadow-lg shadow-emerald-500/50',
                !isCurrent && achieved && 'ring-emerald-400/60',
                !achieved && 'grayscale ring-white/10'
              )}>
                <Icon className={cn('h-6 w-6 text-white', !achieved && 'opacity-50')} />
                {/* Check verde no canto: aparece em TODOS os tiers conquistados (incluindo o atual) */}
                {achieved && (
                  <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[8px] font-black rounded-full w-5 h-5 flex items-center justify-center shadow-lg ring-2 ring-slate-900">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                {!achieved && !isNext && (
                  <span className="absolute -bottom-1 -right-1 bg-slate-700 text-slate-300 rounded-full w-5 h-5 flex items-center justify-center shadow ring-2 ring-slate-900">
                    <Lock className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-sm">{tier.name}</h4>
                  {isCurrent && (
                    <span className="text-[9px] uppercase tracking-widest font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                      Você está aqui
                    </span>
                  )}
                  {isNext && (
                    <span className="text-[9px] uppercase tracking-widest font-bold bg-amber-400/20 text-amber-200 px-1.5 py-0.5 rounded">
                      Próximo
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                  {tier.groupsRequired === 0
                    ? 'Sem grupos vinculados'
                    : `${tier.groupsRequired}${tier.name === 'VIP' ? '+' : ''} grupo${tier.groupsRequired > 1 ? 's' : ''} válido${tier.groupsRequired > 1 ? 's' : ''}`}
                </p>
              </div>

              {/* % de comissão */}
              <div className="text-right shrink-0">
                <p className={cn(
                  'text-2xl font-black leading-none',
                  isCurrent && 'text-emerald-300',
                  !isCurrent && achieved && 'text-emerald-400',
                  !achieved && 'text-slate-500'
                )}>
                  {tier.rate}%
                </p>
                <p className={cn(
                  'text-[9px] uppercase tracking-wider mt-0.5',
                  achieved ? 'text-emerald-200/80' : 'text-slate-400'
                )}>
                  taxa TX8
                </p>
              </div>

              {/* Conector entre tiers (linha vertical) — verde quando o próximo tier também foi atingido */}
              {idx < TIER_LADDER.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-9 -bottom-2 w-0.5 h-2',
                    achieved && validGroups >= TIER_LADDER[idx + 1].groupsRequired
                      ? 'bg-emerald-400'
                      : achieved
                        ? 'bg-emerald-500/40'
                        : 'bg-white/10'
                  )}
                />
              )}
            </div>
          );
        })}

        {/* Rodapé com call to action */}
        {next && (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/30 flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-amber-300 shrink-0" />
            <p className="text-xs text-amber-100 font-medium">
              Falta{groupsToNext > 1 ? 'm' : ''}{' '}
              <span className="font-black text-white">{groupsToNext} grupo{groupsToNext > 1 ? 's' : ''}</span>{' '}
              válido{groupsToNext > 1 ? 's' : ''} pra subir pra{' '}
              <span className="font-black text-white">{next.name}</span>{' '}
              <span className="text-amber-300">({next.rate}%)</span>.
            </p>
          </div>
        )}
        {!next && (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30 flex items-center gap-2">
            <Crown className="h-4 w-4 text-emerald-300 shrink-0" />
            <p className="text-xs text-emerald-100 font-medium">
              Você atingiu o topo: <span className="font-black text-white">VIP</span> — a menor taxa da plataforma.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
