import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalCall } from '@/contexts/GlobalCallContext';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';
import { useMotoTaxiRides } from '@/hooks/useMotoTaxiRides';
import {
  TrendingDown,
  Trophy,
  Target,
  Sparkles,
  Users,
  Zap,
  Crown,
  Check,
  ChevronRight,
  Plus,
  Eye,
  Clock,
  AlertCircle,
  ArrowUpRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Active state components
import MotoboyActiveCallCard from '@/components/motoboy/MotoboyActiveCallCard';
import ActiveRideCard from '@/components/motoboy/ActiveRideCard';

// ========================================
// CONSTANTS — Regras reais de comissão
// ========================================
const MIN_COMMISSION = 6;
const MAX_COMMISSION = 25;
const MONTHLY_REVENUE_BASE = 3500;

const TIERS = [
  { groups: 0, rate: 25, label: '0 grupos', level: 'Bronze', icon: '🥉' },
  { groups: 1, rate: 18, label: '1 grupo', level: 'Prata', icon: '🥈' },
  { groups: 2, rate: 11, label: '2 grupos', level: 'Ouro', icon: '🥇' },
  { groups: 3, rate: 6, label: '3 grupos', level: 'Elite', icon: '👑', best: true },
];

const getLevelInfo = (groups: number) => {
  const clamped = Math.min(groups, 3);
  return TIERS[clamped];
};

const getNextTier = (groups: number) => {
  if (groups >= 3) return null;
  return TIERS[Math.min(groups + 1, 3)];
};

const getRateColor = (rate: number) => {
  if (rate <= 8) return 'text-emerald-600';
  if (rate <= 15) return 'text-amber-500';
  return 'text-red-500';
};

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ========================================
// MAIN COMPONENT
// ========================================
export default function MotoboyDashboardPremium() {
  const navigate = useNavigate();
  const { user, activeProfile } = useAuth();
  const isMototaxi = activeProfile === 'mototaxi';
  const basePath = isMototaxi ? '/mototaxi' : '/motoboy';

  const { commissionRate, activeGroups, isLoading } = useMotoboyCommission(user?.id);
  const {
    activeCall,
    showModal,
    hasActiveCall,
    isProcessing,
    acceptCall,
    rejectCall,
    lastAcceptedRideId,
    clearLastAcceptedRideId,
  } = useGlobalCall();

  const motoTaxiRidesHook = useMotoTaxiRides();
  const hasActiveRide = isMototaxi && motoTaxiRidesHook.hasActiveRide;
  const activeRide = isMototaxi ? motoTaxiRidesHook.activeRide : null;

  useEffect(() => {
    if (!isProcessing && isMototaxi && !hasActiveCall) {
      const timeout = setTimeout(() => {
        if (lastAcceptedRideId) {
          motoTaxiRidesHook.refresh(lastAcceptedRideId);
          clearLastAcceptedRideId();
        } else {
          motoTaxiRidesHook.refresh();
        }
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isProcessing, isMototaxi, hasActiveCall, lastAcceptedRideId, clearLastAcceptedRideId]);

  // Priority renders
  if (hasActiveRide && activeRide) {
    return (
      <div className="flex-1 p-4">
        <ActiveRideCard
          ride={activeRide}
          passengerInfo={motoTaxiRidesHook.passengerInfo}
          isLoadingPassenger={motoTaxiRidesHook.isLoadingPassenger}
          onStart={motoTaxiRidesHook.startRide}
          onComplete={motoTaxiRidesHook.completeRide}
          onCancel={motoTaxiRidesHook.cancelRide}
          routeData={motoTaxiRidesHook.routeData}
          isCalculatingRoute={motoTaxiRidesHook.isCalculatingRoute}
          motoboyPosition={motoTaxiRidesHook.motoTaxiPosition}
        />
      </div>
    );
  }

  if (hasActiveCall && !showModal && activeCall) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <MotoboyActiveCallCard
          call={activeCall}
          onAccept={acceptCall}
          onReject={rejectCall}
          isAccepting={isProcessing}
        />
      </div>
    );
  }

  // Data
  const hasData = commissionRate !== null && commissionRate !== undefined;
  const rate = commissionRate ?? MAX_COMMISSION;
  const groups = activeGroups ?? 0;
  const level = getLevelInfo(groups);
  const nextTier = getNextTier(groups);
  const progress = Math.round(((MAX_COMMISSION - rate) / (MAX_COMMISSION - MIN_COMMISSION)) * 100);
  const atMin = rate <= MIN_COMMISSION;

  // Economy simulation
  const currentFee = (MONTHLY_REVENUE_BASE * rate) / 100;
  const minFee = (MONTHLY_REVENUE_BASE * MIN_COMMISSION) / 100;
  const savings = currentFee - minFee;

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4 bg-[hsl(var(--motoboy-dashboard-bg))]">
        <Card className="border-0 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-900 p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-28 bg-white/20 rounded" />
              <div className="h-14 w-24 bg-white/20 rounded" />
              <div className="h-3 w-full bg-white/20 rounded-full" />
            </div>
          </div>
        </Card>
        {[1, 2, 3].map(i => (
          <Card key={i} className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-8 w-full bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-[hsl(var(--motoboy-dashboard-bg))]">

      {/* ═══════════════════════════════════════════
          1️⃣ CARD PRINCIPAL — Sua Comissão Atual
          ═══════════════════════════════════════════ */}
      <Card className="border-0 shadow-xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900">
          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-emerald-400/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />

          <CardContent className="relative p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-emerald-300" />
                <span className="text-xs font-semibold text-emerald-100 tracking-wide uppercase">
                  Sua Comissão Atual
                </span>
              </div>
              <Badge className="px-2.5 py-1 text-[10px] font-bold border-0 shadow-lg bg-white/15 text-white backdrop-blur-sm">
                {level.icon} {level.level}
              </Badge>
            </div>

            {/* Big number + context */}
            {!hasData ? (
              <div className="flex items-center gap-3 py-4">
                <AlertCircle className="h-6 w-6 text-amber-300 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white">Sincronizando dados...</p>
                  <p className="text-xs text-white/60">Sua comissão será exibida em instantes.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-1">
                  <span className={cn(
                    "text-6xl font-black tracking-tighter leading-none drop-shadow-lg",
                    rate <= 12 ? "text-emerald-200" : rate <= 20 ? "text-amber-200" : "text-red-300"
                  )}>
                    {rate}
                  </span>
                  <span className="text-2xl font-bold text-emerald-200/70 mb-1">%</span>
                  {atMin && <Sparkles className="h-6 w-6 text-amber-400 animate-pulse ml-2 mb-1" />}
                </div>

                <p className="text-xs text-emerald-100/80">
                  Comissão calculada com base em <span className="font-bold text-white">{groups} grupo{groups !== 1 ? 's' : ''} ativo{groups !== 1 ? 's' : ''}</span>
                </p>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-emerald-200/70">Progresso para meta mínima ({MIN_COMMISSION}%)</span>
                    <span className="text-white font-bold">{progress}%</span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-emerald-950/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-400 transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <Trophy className="h-2.5 w-2.5 text-amber-400" />
                      <span className="text-[8px] font-bold text-amber-400">{MIN_COMMISSION}%</span>
                    </div>
                  </div>
                </div>

                {/* Incentive text */}
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-xs',
                  atMin ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-950/40 text-emerald-200'
                )}>
                  <Target className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {atMin
                      ? '🎉 Parabéns! Você atingiu a comissão mínima!'
                      : rate <= 12
                        ? '🚀 Muito perto do objetivo! Continue assim!'
                        : rate <= 20
                          ? '📈 Bom progresso! Adicione mais grupos para economizar.'
                          : '💡 Cadastre grupos de WhatsApp para reduzir sua comissão.'}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </div>
      </Card>

      {/* ═══════════════════════════════════════════
          2️⃣ CARD — Como Reduzir sua Comissão
          ═══════════════════════════════════════════ */}
      {!atMin && hasData && (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                <ArrowUpRight className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-foreground">Como Reduzir sua Comissão</h3>
                {nextTier && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Adicione <span className="font-bold text-foreground">1 grupo válido</span> para reduzir sua comissão para{' '}
                    <span className="font-bold text-primary">{nextTier.rate}%</span>
                  </p>
                )}
                {!atMin && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Economia potencial: <span className="font-semibold text-amber-600">{formatBRL(savings)}/mês</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => navigate(`${basePath}/central-grupos`)}
                className="flex-1 h-10 text-sm font-semibold bg-primary hover:bg-primary/90 shadow-md"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Adicionar Grupo
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const el = document.getElementById('commission-rules-table');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="h-10 text-sm font-medium"
              >
                <Eye className="h-4 w-4 mr-1.5" />
                Ver regras
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════
          3️⃣ CARD — Grupos
          ═══════════════════════════════════════════ */}
      <Card className="border-0 shadow-lg bg-card">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Seus Grupos</h3>
            </div>
            <Badge variant="outline" className="text-xs font-bold">
              {Math.min(groups, 3)}/3 ativos
            </Badge>
          </div>

          {/* Group metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-1.5 mb-1">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 uppercase">Ativos Válidos</span>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{Math.min(groups, 3)}</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/40 border border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Em Análise</span>
              </div>
              <p className="text-2xl font-black text-muted-foreground">0</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Somente grupos <span className="font-bold">ativos e validados</span> reduzem a comissão.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => navigate(`${basePath}/central-grupos`)}
            className="w-full h-9 text-xs"
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Gerenciar Grupos
            <ChevronRight className="h-3.5 w-3.5 ml-auto" />
          </Button>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════
          4️⃣ TABELA — Regras de Comissão Dinâmica
          ═══════════════════════════════════════════ */}
      <Card className="border-0 shadow-lg bg-card" id="commission-rules-table">
        <CardHeader className="pb-2 px-5 pt-5">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-sm font-bold">Regras de Comissão Dinâmica</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-3 bg-muted/60 px-4 py-2.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Grupos Ativos</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-center">Comissão</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide text-right">Nível</span>
            </div>

            {/* Table rows */}
            {TIERS.map((tier) => {
              const isCurrent = (groups >= 3 && tier.groups === 3) || (groups < 3 && tier.groups === groups);

              return (
                <div
                  key={tier.groups}
                  className={cn(
                    'grid grid-cols-3 px-4 py-3 items-center border-t border-border transition-colors',
                    isCurrent
                      ? 'bg-primary/8 border-l-[3px] border-l-primary'
                      : 'hover:bg-muted/20'
                  )}
                >
                  {/* Groups */}
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{tier.icon}</span>
                    <span className={cn(
                      'text-sm font-semibold',
                      isCurrent ? 'text-primary' : 'text-foreground'
                    )}>
                      {tier.label}
                    </span>
                    {isCurrent && (
                      <Badge className="text-[8px] px-1.5 py-0 bg-primary text-primary-foreground border-0">
                        VOCÊ
                      </Badge>
                    )}
                  </div>

                  {/* Rate */}
                  <div className="text-center">
                    <span className={cn(
                      'text-xl font-black',
                      isCurrent ? getRateColor(tier.rate) : 'text-foreground/70'
                    )}>
                      {tier.rate}%
                    </span>
                  </div>

                  {/* Level */}
                  <div className="text-right">
                    <span className={cn(
                      'text-xs font-semibold',
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      {tier.level}
                    </span>
                    {tier.best && (
                      <div className="text-[9px] text-amber-600 font-medium">⭐ Melhor taxa</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
}
