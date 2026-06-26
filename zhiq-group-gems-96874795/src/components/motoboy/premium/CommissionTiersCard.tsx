import { useEffect, useRef, useState } from 'react';
import { Crown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CommissionTiersCardProps {
  commissionRate: number | null | undefined;
  hasCompletedFirstRide?: boolean;
  isLoading?: boolean;
}

const TIERS = [
  { rate: 25, label: '25%', nivel: 'Inicial',  grupos: '0 grupos'  },
  { rate: 20, label: '20%', nivel: 'Bronze',   grupos: '1 grupo'   },
  { rate: 16, label: '16%', nivel: 'Prata',    grupos: '2 grupos'  },
  { rate: 12, label: '12%', nivel: 'Ouro',     grupos: '3 grupos'  },
  { rate: 9,  label: '9%',  nivel: 'Elite',    grupos: '4 grupos'  },
  { rate: 6,  label: '6%',  nivel: 'VIP',      grupos: '5+ grupos', isMeta: true },
];

export function CommissionTiersCard({
  commissionRate,
  hasCompletedFirstRide = true,
  isLoading = false,
}: CommissionTiersCardProps) {
  // Backend-driven: display rate exclusively from profiles.percentual_comissao_atual
  const currentRate = commissionRate ?? null;
  const prevRateRef = useRef<number | null>(null);
  const [animatingRate, setAnimatingRate] = useState<number | null>(null);

  // Detect changes and trigger animation
  useEffect(() => {
    if (currentRate !== null && prevRateRef.current !== null && prevRateRef.current !== currentRate) {
      setAnimatingRate(currentRate);
      const timer = setTimeout(() => setAnimatingRate(null), 500);
      return () => clearTimeout(timer);
    }
    prevRateRef.current = currentRate;
  }, [currentRate]);

  if (isLoading) {
    return (
      <Card className="border-0 bg-card/90 shadow-lg">
        <CardHeader className="pb-3">
          <div className="animate-pulse h-5 w-40 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-10 w-full bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-card/90 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Crown className="h-4 w-4 text-amber-500" />
          Faixas de Comissão
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1.5">
        {TIERS.map((tier) => {
          const isCurrent = currentRate === tier.rate;
          const isAbove = currentRate !== null && tier.rate > currentRate; // worse tiers already surpassed
          const isBelow = currentRate !== null && tier.rate < currentRate; // better tiers = next/meta
          const isAnimating = animatingRate === tier.rate;

          return (
            <div
              key={tier.rate}
              className={cn(
                'relative flex items-center justify-between p-3 rounded-xl transition-all duration-300',
                isCurrent && 'bg-emerald-100 dark:bg-emerald-900/40 border-2 border-emerald-500 shadow-md',
                isAbove && 'bg-muted/30 opacity-50',
                isBelow && 'bg-muted/30 opacity-50',
                tier.isMeta && !isCurrent && 'border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 opacity-100',
                isAnimating && 'animate-[scale-highlight_0.4s_ease-out]'
              )}
              style={isAnimating ? {
                animation: 'scale-highlight 0.4s ease-out',
              } : undefined}
            >
              {/* Left side */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-colors shrink-0',
                  isCurrent && 'bg-emerald-500 text-white',
                  !isCurrent && !tier.isMeta && 'bg-muted text-muted-foreground',
                  tier.isMeta && !isCurrent && 'bg-amber-400 text-amber-950'
                )}>
                  {tier.isMeta ? (
                    <Crown className="h-4 w-4" />
                  ) : (
                    tier.rate
                  )}
                </div>

                <div>
                  <div className={cn(
                    'text-sm font-semibold leading-tight',
                    isCurrent && 'text-emerald-800 dark:text-emerald-200',
                    !isCurrent && 'text-muted-foreground'
                  )}>
                    {tier.label} <span className="font-normal opacity-70">— {tier.nivel}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{tier.grupos}</div>
                </div>
              </div>

              {/* Right side - badges */}
              <div className="flex items-center gap-2">
                {isCurrent && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase">
                    Atual
                  </span>
                )}

                {tier.isMeta && !isCurrent && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-bold uppercase">
                    Meta
                  </span>
                )}
              </div>

              {/* Current tier arrow */}
              {isCurrent && (
                <div className="absolute -left-1 top-1/2 -translate-y-1/2">
                  <ChevronRight className="h-5 w-5 text-emerald-500" />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Inline keyframes for the highlight animation */}
      <style>{`
        @keyframes scale-highlight {
          0% { transform: scale(0.96); opacity: 0.7; }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Card>
  );
}
