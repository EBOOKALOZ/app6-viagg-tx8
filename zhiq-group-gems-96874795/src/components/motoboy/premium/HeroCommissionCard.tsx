import { TrendingDown, Trophy, Target, Sparkles, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HeroCommissionCardProps {
  commissionRate: number | null | undefined;
  activeGroups: number | null | undefined;
  hasCompletedFirstRide?: boolean;
  isLoading?: boolean;
}

const MIN_COMMISSION = 6;
const MAX_GROUPS_TARGET = 3;

function getStatusMessage(hasCompletedFirstRide: boolean, activeGroups: number): string {
  if (!hasCompletedFirstRide) {
    return 'Primeira corrida liberada com comissão fixa de 25%.\nApós a primeira corrida, sua comissão reduz conforme grupos ativos.';
  }
  if (activeGroups === 0) return 'Cadastre grupos válidos para reduzir sua comissão.';
  if (activeGroups === 1) return 'Você está a 2 grupos de atingir a comissão mínima.';
  if (activeGroups === 2) return 'Falta apenas 1 grupo para atingir a comissão mínima.';
  return 'Parabéns! Você atingiu a comissão mínima de 6%.';
}

export function HeroCommissionCard({
  commissionRate,
  activeGroups,
  hasCompletedFirstRide = false,
  isLoading = false,
}: HeroCommissionCardProps) {
  const hasData = commissionRate !== null && commissionRate !== undefined;
  const displayRate = commissionRate ?? null;
  const displayGroups = activeGroups ?? 0;

  // Progress bar based on groups (0/3 → 0%, 3+/3 → 100%)
  const groupProgress = Math.min(Math.round((displayGroups / MAX_GROUPS_TARGET) * 100), 100);

  const statusMessage = getStatusMessage(hasCompletedFirstRide, displayGroups);

  if (isLoading) {
    return (
      <Card className="border-0 overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-28 bg-white/20 rounded" />
            <div className="h-16 w-24 bg-white/20 rounded" />
            <div className="h-3 w-full bg-white/20 rounded-full" />
            <div className="h-4 w-48 bg-white/20 rounded" />
          </div>
        </div>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card className="border-0 overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 p-6">
          <div className="flex items-center gap-3 text-white/80">
            <AlertTriangle className="h-6 w-6 text-amber-300" />
            <div>
              <p className="font-semibold text-white">Sincronizando dados...</p>
              <p className="text-sm text-white/70">Sua comissão será exibida em instantes.</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-0 overflow-hidden shadow-xl">
      <div className="relative bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-400/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />

        <CardContent className="relative p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-emerald-300" />
              <span className="text-sm font-medium text-emerald-100">
                Sua Comissão Atual
              </span>
            </div>
            {displayRate !== null && displayRate <= MIN_COMMISSION && (
              <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-amber-950 border-0 shadow-lg px-3 py-1 font-bold text-xs">
                <span className="mr-1">👑</span> Elite
              </Badge>
            )}
          </div>

          {/* Main commission display */}
          <div className="flex items-end gap-2">
            <span className="text-6xl font-black text-white tracking-tighter drop-shadow-lg">
              {displayRate !== null ? displayRate : '—'}
            </span>
            <span className="text-3xl font-bold text-emerald-200 mb-1">%</span>
            {displayRate !== null && displayRate <= MIN_COMMISSION && (
              <Sparkles className="h-8 w-8 text-amber-400 animate-pulse ml-2 mb-2" />
            )}
          </div>

          {/* Progress bar (groups-based, purely visual) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-200">Progresso de grupos</span>
              <span className="text-white font-bold">{Math.min(displayGroups, MAX_GROUPS_TARGET)}/{MAX_GROUPS_TARGET}</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-emerald-950/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-400 transition-all duration-700 ease-out"
                style={{ width: `${groupProgress}%` }}
              />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 pr-1">
                <Trophy className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400">{MIN_COMMISSION}%</span>
              </div>
            </div>
          </div>

          {/* Dynamic status message */}
          <div className={cn(
            'flex items-start gap-2 px-3 py-2 rounded-lg text-sm whitespace-pre-line',
            displayGroups >= MAX_GROUPS_TARGET && hasCompletedFirstRide
              ? 'bg-amber-400/20 text-amber-200'
              : 'bg-emerald-950/30 text-emerald-200'
          )}>
            <Target className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
