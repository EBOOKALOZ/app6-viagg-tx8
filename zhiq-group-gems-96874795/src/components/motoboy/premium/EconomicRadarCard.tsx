import { TrendingUp, Calculator, Wallet, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EconomicRadarCardProps {
  commissionRate: number | null | undefined;
  isLoading?: boolean;
  averageMonthlyRevenue?: number; // Average monthly gross revenue in BRL
}

const MIN_COMMISSION = 6;
const DEFAULT_MONTHLY_REVENUE = 3500; // Default estimate

export function EconomicRadarCard({
  commissionRate,
  isLoading = false,
  averageMonthlyRevenue = DEFAULT_MONTHLY_REVENUE,
}: EconomicRadarCardProps) {
  const hasData = commissionRate !== null && commissionRate !== undefined;
  const currentRate = commissionRate ?? 25; // fallback only for display math, backend is source of truth
  
  // Calculate potential savings
  const currentDeduction = (averageMonthlyRevenue * currentRate) / 100;
  const minDeduction = (averageMonthlyRevenue * MIN_COMMISSION) / 100;
  const potentialSavings = currentDeduction - minDeduction;
  const savingsPercentage = currentRate > MIN_COMMISSION 
    ? Math.round((potentialSavings / currentDeduction) * 100) 
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card className="border-0 bg-card/90 shadow-lg">
        <CardHeader className="pb-3">
          <div className="animate-pulse h-5 w-32 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-12 w-28 bg-muted rounded" />
            <div className="h-4 w-full bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isAtMinimum = currentRate <= MIN_COMMISSION;

  return (
    <Card className="border-0 bg-card/90 shadow-lg overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          Radar Econômico
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isAtMinimum ? (
          // Already at minimum - celebration state
          <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="p-3 rounded-full bg-emerald-500/20">
              <Wallet className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-emerald-700 dark:text-emerald-300">
                🎉 Economia Máxima Atingida!
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Você está na menor comissão possível.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Potential savings highlight */}
            <div className="relative p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                    Economia Potencial/Mês
                  </p>
                  <p className="text-3xl font-black text-amber-600 dark:text-amber-300 tracking-tight">
                    {formatCurrency(potentialSavings)}
                  </p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-xs font-bold">{savingsPercentage}%</span>
                </div>
              </div>
              
              <p className="mt-2 text-xs text-amber-600/80 dark:text-amber-400/70">
                Baseado em faturamento médio de {formatCurrency(averageMonthlyRevenue)}/mês
              </p>
            </div>

            {/* Comparison breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">
                  Comissão Atual
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-destructive">{currentRate}%</span>
                  <span className="text-xs text-muted-foreground">= {formatCurrency(currentDeduction)}</span>
                </div>
              </div>
              
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 space-y-1">
                <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase">
                  Meta Mínima
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{MIN_COMMISSION}%</span>
                  <span className="text-xs text-emerald-500/80">= {formatCurrency(minDeduction)}</span>
                </div>
              </div>
            </div>

            {/* CTA hint */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <ArrowRight className="h-3 w-3" />
              <span>Adicione grupos de WhatsApp para economizar mais.</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
