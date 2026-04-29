import { TrendingDown, Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CommissionCardProps {
  commissionRate: number | null | undefined;
  activeGroups: number | null | undefined;
  isLoading?: boolean;
}

export function CommissionCard({
  commissionRate,
  activeGroups,
  isLoading = false,
}: CommissionCardProps) {
  // Handle null/undefined - show error state instead of fallback
  const hasData = commissionRate !== null && commissionRate !== undefined;
  const displayRate = commissionRate ?? 0;
  const displayGroups = activeGroups ?? 0;

  // Dynamic color based on commission rate
  const getCommissionColor = () => {
    if (!hasData) return 'text-muted-foreground';
    if (displayRate <= 8) return 'text-primary';
    if (displayRate <= 15) return 'text-primary/80';
    if (displayRate <= 22) return 'text-accent-foreground';
    return 'text-destructive';
  };

  const getTierLabel = () => {
    if (displayGroups >= 3) return { label: 'Elite', color: 'bg-primary' };
    if (displayGroups >= 2) return { label: 'Ouro', color: 'bg-accent' };
    if (displayGroups >= 1) return { label: 'Prata', color: 'bg-muted-foreground' };
    return { label: 'Bronze', color: 'bg-muted-foreground/70' };
  };

  const tier = getTierLabel();

  if (isLoading) {
    return (
      <Card className="border-0 bg-card/80 backdrop-blur-sm shadow-lg">
        <CardContent className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-12 w-20 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state if no backend data
  if (!hasData) {
    return (
      <Card className="border-0 bg-card/80 backdrop-blur-sm shadow-lg border-destructive/30">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Comissão não calculada</p>
              <p className="text-xs">Seus dados estão sendo sincronizados...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Comissão Atual
              </span>
              <span
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-semibold text-white',
                  tier.color
                )}
              >
                {tier.label}
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  'text-5xl font-extrabold tracking-tighter transition-colors duration-500',
                  getCommissionColor()
                )}
              >
                {displayRate}
              </span>
              <span className={cn('text-2xl font-bold', getCommissionColor())}>
                %
              </span>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              {Math.min(displayGroups, 3)}/3 grupos ativos
            </p>
          </div>

          <button className="p-2 rounded-full hover:bg-muted/50 transition-colors">
            <Info className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
